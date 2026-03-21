const data = {
    mccInvoiceId: "890-559-4099-test2",
    name: "MCC app chicken test",
    partnerId: null,
    notes: null,
    accounts: [
        {
            status: "ACTIVE",
            accountName: "app 7",
            googleAccountId: "142-756-3825",
            currency: "USD"
        }
    ]
};

async function test(data: any) {
    const { mccInvoiceId, name, partnerId, notes, accounts } = data;
    const results = { created: 0, updated: 0, linked: 0, errors: 0 };
    for (const account of accounts) {
        try {
            const { googleAccountId, accountName, status, currency } = account;
            if (!googleAccountId) continue;
            console.log("Processing account", googleAccountId);
            // mock db
            results.created++;
            results.linked++;
        } catch (e) {
            results.errors++;
        }
    }
    console.log("FINAL", results);
}
test(data);
