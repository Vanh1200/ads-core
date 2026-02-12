function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Admin Tool')
    .addItem('ℹ️ Cập nhật Dữ Liệu (Info only)', 'updateInfo')
    .addItem('💰 Cập nhật Chi Tiêu (Spending only)', 'updateSpending')
    .addSeparator()
    .addItem('🚀 Cập nhật Dữ liệu & Chi tiêu (FULL)', 'updateAll')
    .addSeparator()
    .addItem('📊 Cập nhật Tổng hợp (Summary)', 'updateSummary')
    .addToUi();
}

function updateInfo() { mainProcess({ syncInfo: true, syncSpending: false }); }
function updateSpending() { mainProcess({ syncInfo: false, syncSpending: true }); }
function updateAll() { mainProcess({ syncInfo: true, syncSpending: true }); }

function updateSummary() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const summarySheet = ss.getSheetByName("Summary");
  if (!summarySheet) {
    SpreadsheetApp.getUi().alert("❌ Không tìm thấy sheet 'Summary'!");
    return;
  }

  const sheets = ss.getSheets();

  // Helper functions
  const cleanID = (val) => String(val).trim();
  const formatDateKey = (val) => {
    if (val instanceof Date) {
      return Utilities.formatDate(val, ss.getSpreadsheetTimeZone(), "dd/MM/yyyy");
    }
    return String(val).trim();
  };
  const round2 = (num) => Math.round((num + Number.EPSILON) * 100) / 100;

  // Data consolidation
  let summaryData = [];
  let allDates = new Set();
  let grandTotalSpend = 0;
  let connectedNotSentCount = 0;
  let connectedNotSentDetails = [];
  let dailyTotals = {}; // { 'dd/MM/yyyy': 1234.56 }

  console.log("🛠️ [SUMMARY] BẮT ĐẦU TỔNG HỢP...");

  sheets.forEach(sheet => {
    let name = sheet.getName();

    // --- Logic Scan MA cho B2 (Account nối tín chưa gửi khách) ---
    if (name.startsWith("MA")) {
      if (name.includes("[DIE]")) return;

      let lastRow = sheet.getLastRow();
      if (lastRow < 2) return;

      let data = sheet.getRange(1, 1, lastRow, sheet.getLastColumn()).getValues();
      let headers = data[0];

      // Tìm cột "Trạng thái đi tín" & "Trạng thái gửi khách"
      let colIndexCred = headers.findIndex(h => String(h).toLowerCase().includes("đi tín"));
      let colIndexSent = headers.findIndex(h => String(h).toLowerCase().includes("gửi khách"));
      let colIndexID = 2;

      if (colIndexCred === -1) colIndexCred = 6;
      if (colIndexSent === -1) colIndexSent = 9;

      for (let i = 1; i < data.length; i++) {
        let status = String(data[i][0] || "").toLowerCase();
        let credStatus = String(data[i][colIndexCred] || "").toLowerCase();
        let sentStatus = String(data[i][colIndexSent] || "").toLowerCase();
        let accID = data[i][colIndexID];

        let isActive = status.includes("đang hoạt động") || status.includes("active") || status.includes("live");

        if (isActive && (credStatus === "yes" || credStatus.includes("active") || credStatus.includes("true")) && sentStatus === "no") {
          connectedNotSentCount++;
          connectedNotSentDetails.push(`[MA: ${name}] ID: ${accID}`);
        }
      }
      return;
    }

    // --- Logic Scan MC for Summary Table ---
    if (!name.startsWith("MC")) return;
    if (name.includes("[DIE]")) return;

    console.log(`📂 Đang tổng hợp: ${name}`);

    let lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    let data = sheet.getRange(1, 1, lastRow, sheet.getLastColumn()).getValues();
    let headers = data[0];

    let liveCount = 0;
    let dieCount = 0;
    let totalSpend = 0;
    let spendingByDate = {};

    // Map date columns
    let dateColMap = {};
    for (let j = 7; j < headers.length; j++) {
      let dKey = formatDateKey(headers[j]);
      dateColMap[j] = dKey;
      allDates.add(dKey);
    }

    for (let i = 1; i < data.length; i++) {
      let status = String(data[i][0]).toLowerCase();
      if (status.includes("đang hoạt động") || status.includes("active") || status.includes("live")) {
        liveCount++;
      } else {
        dieCount++;
      }

      for (let j = 7; j < data[i].length; j++) {
        if (dateColMap[j]) {
          let val = Number(data[i][j]);
          if (!isNaN(val)) {
            totalSpend += val;
            spendingByDate[dateColMap[j]] = (spendingByDate[dateColMap[j]] || 0) + val;

            // Add to Global Daily Total
            dailyTotals[dateColMap[j]] = (dailyTotals[dateColMap[j]] || 0) + val;
          }
        }
      }
    }
    grandTotalSpend += totalSpend;

    // Clean name: MC_ABC -> ABC
    let cleanName = name.replace(/^MC_/, "");

    summaryData.push({
      name: cleanName,
      live: liveCount,
      die: dieCount,
      total: totalSpend,
      daily: spendingByDate
    });
  });

  // LOG DETAILS B2
  if (connectedNotSentDetails.length > 0) {
    console.log(`📋 CHI TIẾT ACCOUNT ĐÃ NỐI TÍN - CHƯA GỬI KHÁCH (${connectedNotSentDetails.length}):`);
    connectedNotSentDetails.forEach(detail => console.log(`   🔸 ${detail}`));
  } else {
    console.log(`📋 Không tìm thấy account nào Đã nối tín - Chưa gửi khách.`);
  }

  if (summaryData.length === 0 && connectedNotSentCount === 0) {
    ss.toast("Không có dữ liệu sheet để tổng hợp.", "Thông báo");
    return;
  }

  // Sort dates properly
  let sortedDates = Array.from(allDates).sort((a, b) => {
    let parseDate = (dStr) => {
      let parts = dStr.split('/').map(Number);
      let y = parts[2] ? parts[2] : new Date().getFullYear();
      let m = parts[1] ? parts[1] - 1 : 0;
      let d = parts[0];
      return new Date(y, m, d).getTime();
    };
    return parseDate(a) - parseDate(b);
  });

  // Output Table
  let outputHeaders = ["Tên khách", "Tổng số account sống", "Tổng số tài khoản die", "Tổng chi tiêu", ...sortedDates];
  let outputRows = [];

  summaryData.forEach(item => {
    let row = [
      item.name,
      item.live,
      item.die,
      round2(item.total)
    ];
    sortedDates.forEach(d => {
      row.push(round2(item.daily[d] || 0));
    });
    outputRows.push(row);
  });

  console.log("💾 Đang ghi vào sheet Summary...");

  // Write B1, B2 Metrics
  summarySheet.getRange("B1").setValue(round2(grandTotalSpend));
  summarySheet.getRange("B2").setValue(connectedNotSentCount);

  // Write Daily Totals to Row 1 (Starting from Col E -> Col 5?)
  // Table Table Header starts at Row 9. Date columns start at Index 4 (Col E) of outputHeaders.
  // So Row 1, Col 5 matches Date 1.
  if (sortedDates.length > 0) {
    let dailyTotalRow = sortedDates.map(d => round2(dailyTotals[d] || 0));
    // Clear previous totals to avoid ghost data
    summarySheet.getRange(1, 5, 1, Math.max(dailyTotalRow.length, 20)).clearContent();
    // Write new totals
    summarySheet.getRange(1, 5, 1, dailyTotalRow.length).setValues([dailyTotalRow]);
  }

  // Write Table
  let maxRows = summarySheet.getMaxRows();
  if (maxRows >= 9) {
    summarySheet.getRange(9, 1, maxRows - 8, summarySheet.getMaxColumns()).clearContent();
  }

  if (outputRows.length > 0) {
    summarySheet.getRange(9, 1, 1, outputHeaders.length).setValues([outputHeaders])
      .setFontWeight("bold")
      .setBackground("#4c1130")
      .setFontColor("white");

    summarySheet.getRange(10, 1, outputRows.length, outputHeaders.length).setValues(outputRows);
  }

  console.log("🏁 UPDATE SUMMARY DONE.");
  ss.toast("Đã cập nhật bảng tổng hợp!", "Thành công");
}

function mainProcess(config) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  const ui = SpreadsheetApp.getUi();

  const DO_INFO = config.syncInfo;
  const DO_SPENDING = config.syncSpending;
  const NUMBER_FORMAT_STR = "#,##0.####";

  let globalData = {};
  let spendingData = {};
  let dateHeadersList = [];

  // Hàm cleanID có thêm log nếu cần
  const cleanID = (val) => String(val).trim();

  const formatDateKey = (val) => {
    if (val instanceof Date) {
      return Utilities.formatDate(val, ss.getSpreadsheetTimeZone(), "dd/MM/yyyy");
    }
    return String(val).trim();
  };

  console.log("🛠️ [DEBUG] BẮT ĐẦU QUÉT DỮ LIỆU NGUỒN...");

  // ================= BƯỚC 1: ĐỌC DỮ LIỆU (READ) =================
  try {
    sheets.forEach(sheet => {
      let name = sheet.getName();

      // --- ĐỌC MA ---
      if (name.startsWith("MA")) {
        if (name.includes("[DIE]")) {
          console.log(`⏩ [SKIP] Bỏ qua sheet DIE: ${name}`);
          return;
        }
        console.log(`📂 Đang đọc Sheet MA: ${name}`);
        let lastRow = sheet.getLastRow();
        let lastCol = sheet.getLastColumn();
        if (lastRow < 2) return;

        let data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
        let headers = data[0];

        // Đọc Info
        for (let i = 1; i < data.length; i++) {
          let accID = cleanID(data[i][2]);
          if (accID) {
            if (!globalData[accID]) globalData[accID] = {};
            globalData[accID].status = data[i][0];
            globalData[accID].accName = data[i][1];
            globalData[accID].mccAccName = data[i][3];
            globalData[accID].mccAccID = data[i][4];
          }
        }

        // Đọc Chi tiêu
        if (DO_SPENDING && lastCol > 11) {
          let foundSpendingCount = 0;
          for (let j = 11; j < lastCol; j++) {
            let headerRaw = headers[j];
            if (headerRaw) {
              let headerKey = formatDateKey(headerRaw);
              if (!spendingData[headerKey]) {
                spendingData[headerKey] = {};
                dateHeadersList.push({ key: headerKey, raw: headerRaw });
              }
              for (let i = 1; i < data.length; i++) {
                let accID = cleanID(data[i][2]);
                let amount = data[i][j];
                if (accID && amount !== "" && amount != null) {
                  let val = Number(amount);
                  let finalVal = isNaN(val) ? 0 : val;
                  spendingData[headerKey][accID] = finalVal;

                  // LOG DEBUG SAMPLE (Chỉ log 1 vài cái đầu tiên để check)
                  if (foundSpendingCount < 3) {
                    console.log(`   + [MA] Tìm thấy chi tiêu: Ngày ${headerKey} - ID [${accID}] - Tiền: ${finalVal}`);
                    foundSpendingCount++;
                  }
                }
              }
            }
          }
          console.log(`   => Tổng số ngày có dữ liệu chi tiêu: ${dateHeadersList.length}`);
        }
      }

      // --- ĐỌC MI/MC (INFO MAP) ---
      else if (name.startsWith("MI") || name.startsWith("MC")) {
        let lastRow = sheet.getLastRow();
        if (lastRow < 2) return;
        let data = sheet.getRange(1, 1, lastRow, sheet.getLastColumn()).getValues();

        if (name.startsWith("MI")) {
          for (let i = 1; i < data.length; i++) {
            let accID = cleanID(data[i][2]);
            if (accID) {
              if (!globalData[accID]) globalData[accID] = {};
              if (data[i][5]) globalData[accID].mccInvName = data[i][5];
              if (data[i][6]) globalData[accID].mccInvID = data[i][6];
            }
          }
        }
        else if (name.startsWith("MC")) {
          for (let i = 1; i < data.length; i++) {
            let accID = cleanID(data[i][2]);
            if (accID) {
              if (!globalData[accID]) globalData[accID] = {};
              globalData[accID].customerSheet = name;
            }
          }
        }
      }
    });
  } catch (e) {
    console.error("❌ Lỗi đọc dữ liệu: " + e.message);
    return;
  }

  console.log("---------------------------------------------");
  console.log("🛠️ [DEBUG] BẮT ĐẦU QUÁ TRÌNH GHI VÀ TẠO CỘT...");

  // ================= BƯỚC 2: GHI DỮ LIỆU (WRITE) =================
  sheets.forEach(sheet => {
    try {
      let name = sheet.getName();
      if (!name.startsWith("MA") && !name.startsWith("MI") && !name.startsWith("MC")) return;

      if (name.startsWith("MA") && name.includes("[DIE]")) {
        console.log(`⏩ [SKIP] Bỏ qua ghi sheet DIE: ${name}`);
        return;
      }

      // Đọc toàn bộ dữ liệu 1 lần
      let lastRow = sheet.getLastRow();
      let lastCol = sheet.getLastColumn();

      // Xử lý sheet rỗng
      if (lastRow < 2) {
        if (DO_SPENDING && (name.startsWith("MI") || name.startsWith("MC"))) {
          console.log(`   ⚠️ Sheet ${name} không có dữ liệu (ít hơn 2 dòng).`);
        }
        return;
      }

      // Lấy toàn bộ data
      let fullRange = sheet.getRange(1, 1, lastRow, lastCol);
      let data = fullRange.getValues();
      let headers = data[0];
      let isSheetModified = false;
      let originalColCount = lastCol;

      // Map Header Key -> Index
      let headerMap = {};
      headers.forEach((h, idx) => headerMap[formatDateKey(h)] = idx);

      // --- PHẦN A: XỬ LÝ CỘT (LOGIC TẠO CỘT MỚI CHO MI/MC) ---
      let newColsToAdd = [];
      if (DO_SPENDING && (name.startsWith("MI") || name.startsWith("MC"))) {
        // Lấy danh sách ID trong sheet (từ memory)
        let sheetAccountIDs = new Set();
        for (let i = 1; i < data.length; i++) {
          let id = cleanID(data[i][2]);
          if (id) sheetAccountIDs.add(id);
        }

        // Check ngày nào thiếu
        dateHeadersList.forEach(dateCol => {
          if (!headerMap.hasOwnProperty(dateCol.key)) {
            // Check xem sheet này có cần cột này không
            let dailySpending = spendingData[dateCol.key];
            let isRelevant = false;
            if (dailySpending) {
              for (let accID of sheetAccountIDs) {
                if (dailySpending.hasOwnProperty(accID)) {
                  isRelevant = true;
                  break;
                }
              }
            }

            if (isRelevant) {
              newColsToAdd.push(dateCol);
            }
          }
        });
      }

      // Thêm cột vào data in-memory nếu có
      if (newColsToAdd.length > 0) {
        console.log(`🛠️ [${name}] Thêm ${newColsToAdd.length} cột mới: ${newColsToAdd.map(c => c.key).join(", ")}`);
        newColsToAdd.forEach(col => {
          headers.push(col.raw);
          headerMap[col.key] = headers.length - 1;
        });

        // Mở rộng data rows
        for (let i = 1; i < data.length; i++) {
          for (let k = 0; k < newColsToAdd.length; k++) data[i].push("");
        }
        isSheetModified = true;
      }

      // --- PHẦN B: GHI/UPDATE DỮ LIỆU ---
      // Logic MA
      if (name.startsWith("MA") && DO_INFO) {
        for (let i = 1; i < data.length; i++) {
          let accID = cleanID(data[i][2]);
          let info = globalData[accID] || {};
          let hasInvoice = (info.mccInvID || info.mccInvName) ? true : false;

          const updateCell = (r, c, val) => {
            if (String(data[r][c]) !== String(val)) { data[r][c] = val; isSheetModified = true; }
          };

          updateCell(i, 6, hasInvoice ? "Yes" : "No");
          updateCell(i, 7, info.mccInvName || "");
          updateCell(i, 8, info.mccInvID || "");

          let rawSheetName = info.customerSheet || "";
          let cleanName = rawSheetName.replace(/^MC_?/i, "");
          let hasCustomer = rawSheetName ? "Yes" : "No";

          updateCell(i, 9, hasCustomer);
          updateCell(i, 10, cleanName);
        }
      }
      // Logic MI/MC
      else if (name.startsWith("MI") || name.startsWith("MC")) {
        if (DO_INFO) {
          for (let i = 1; i < data.length; i++) {
            let accID = cleanID(data[i][2]);
            let info = globalData[accID];
            if (info) {
              const updateCell = (r, c, val) => {
                if (val !== undefined && String(data[r][c]) !== String(val)) { data[r][c] = val; isSheetModified = true; }
              };
              updateCell(i, 0, info.status);
              updateCell(i, 1, info.accName);
              updateCell(i, 3, info.mccAccName);
              updateCell(i, 4, info.mccAccID);
              if (name.startsWith("MC")) {
                updateCell(i, 5, info.mccInvName);
                updateCell(i, 6, info.mccInvID);
              }
            }
          }
        }

        if (DO_SPENDING) {
          for (let i = 1; i < data.length; i++) {
            let accID = cleanID(data[i][2]);
            for (let dateKey in spendingData) {
              if (headerMap.hasOwnProperty(dateKey)) {
                let val = spendingData[dateKey][accID];
                if (val !== undefined) {
                  let colIndex = headerMap[dateKey];
                  let numAmount = Number(val);
                  if (isNaN(numAmount)) numAmount = 0;

                  let currentVal = data[i][colIndex];
                  if ((currentVal === "" && numAmount === 0) || Math.abs(Number(currentVal) - numAmount) > 0.000001) {
                    data[i][colIndex] = numAmount;
                    isSheetModified = true;
                  }
                }
              }
            }
          }
        }
      }

      // --- WRITE BACK ---
      if (isSheetModified) {
        // Check if we need to expand columns physically
        let totalCols = headers.length;
        let maxCols = sheet.getMaxColumns();
        if (totalCols > maxCols) {
          sheet.insertColumnsAfter(maxCols, totalCols - maxCols);
        }

        // Write data
        sheet.getRange(1, 1, data.length, totalCols).setValues(data);

        // // Format new columns if any
        // if (newColsToAdd.length > 0) {
        //   let startCol = originalColCount + 1;
        //   let numNew = newColsToAdd.length;
        //   // Format cho cột mới (từ row 2 tới hết sheet)
        //   sheet.getRange(2, startCol, sheet.getMaxRows() - 1, numNew).setNumberFormat(NUMBER_FORMAT_STR);
        // }
        console.log(`✅ [${name}] Đã cập nhật xong.`);
      }

    } catch (e) {
      console.error(`❌ Lỗi xử lý sheet [${sheet.getName()}]: ${e.message}`);
    }
  });

  console.log("🏁 DONE.");

  // ==========================================
  // LOGIC TOAST THÔNG BÁO THEO LOẠI CẬP NHẬT
  // ==========================================
  let msgType = "";
  if (DO_INFO && DO_SPENDING) {
    msgType = "TOÀN BỘ (FULL)";
  } else if (DO_INFO) {
    msgType = "DỮ LIỆU (INFO)";
  } else if (DO_SPENDING) {
    msgType = "CHI TIÊU (SPENDING)";
  }

  ss.toast(`Đã cập nhật xong: ${msgType}`, 'Hoàn tất');
}
