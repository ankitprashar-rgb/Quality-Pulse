import { getAccessToken } from '../src/services/googleAuth.js';

// Hardcode environment variables for testing since we can't easily load .env in a standalone script without dotenv
// Values taken from .env file view
const CENTRAL_SHEET_ID = '1SB1kikWg5B20wE47RBZHsuqLvKFj1wN2XY_mEDpI58g';
const BACKEND_SHEET_ID = '1PDWBktsa6WDa-waadkviayR7wEVPiTN3S9SogROlXU8';

async function testFetch(sheetId, name) {
    console.log(`Testing access to ${name} (${sheetId})...`);
    try {
        const token = await getAccessToken();
        // Try to fetch just A1 to minimize data
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A1`;

        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (response.ok) {
            console.log(`✅ Success: Can access ${name}`);
            const data = await response.json();
            console.log('Sample Data:', data);
        } else {
            console.error(`❌ Failed: Cannot access ${name}`);
            console.error(`Status: ${response.status} ${response.statusText}`);
            const text = await response.text();
            console.error('Response:', text);
        }
    } catch (error) {
        console.error(`❌ Error accessing ${name}:`, error);
    }
}

// Mock window object for googleAuth.js if needed (it uses crypto.subtle)
if (typeof crypto === 'undefined') {
    // Node.js implementation of Web Crypto API
    // dynamic import is tricky in standalone script without package.json modification
    // Use built-in fetch if available (Node 18+)
}

// Since googleAuth.js uses browser APIs (crypto.subtle), running this in Node might be tricky without polyfills.
// However, newer Node versions support web crypto.
// Let's try running it.

(async () => {
    await testFetch(CENTRAL_SHEET_ID, 'Central Master Sheet');
    console.log('---');
    await testFetch(BACKEND_SHEET_ID, 'Backend Rejection Log');
})();
