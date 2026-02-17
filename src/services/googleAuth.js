/**
 * Google Service Account JWT Auth for browser environments.
 * Uses Web Crypto API to sign JWTs with the service account private key.
 * Token is cached and refreshed automatically when expired.
 */

// Service account credentials (internal tool — safe for env vars)
const CLIENT_EMAIL = 'sheets-sync@ide-installer-proof.iam.gserviceaccount.com';
const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDgmWWaYAKnmBEC
vtCV7oI1w9FywsaPD/twFk69QiddzjYYYHd49/GnIEE5KGF6BGNLXIoXRw/jXgAG
P7D0qEm5hRZHgYz6/JqqwU28gE3sIh8Birc/xC8+qJGFe7nDgPidmaPLCBc36Hvj
3dg4CqZwkKysKf+x/jI/OgvU68ZDMDlHXUVO+4UTjr3AWVPxybkXLfcFq+wG6GqE
zQ9joEOwHVcTrnxWmcEEYi+dL1J5V5+Rk+JSOeORa2Tu7oYBj55VjeoSH7zEKlAZ
N4DNNBZ3J8k7mFaIEk2mLdApU6HMpPpqE1OL9GuLTLYEq+E26Xfzt6fJCm68Cfv1
vFJ8j7KXAgMBAAECggEAZOCREX7ZAmRbE5QXxJe9NR/QBY71NtFzWfsy/29klg3m
HxnI33ThvXJPyTfZXD/3RyR3w4+/05vnP+dAeArUHjbn9FL8OsjVQSeUXjt0hEAp
E/y1ZLcdjzOQNNeG7ogRYlvdBPaL0ykg6A4+rKEf84QPgj5U4aGt+Nb99HK3eHor
Y//jUzX2yMhTWz/rRWy337tPzzoGpTcs2SKBaxjTOEp1Imk5RRGXfw4yp+X+nGzc
/sgc2AM1QNx7HJD3yPA/HWBvpr1E0Bco4PraBJL6O7gMJOzhscC4urnKpQmjsT7v
U+MeCv6q/ygd1IKIEktEOg1IVQz1ZVgBhd+Y0gfCvQKBgQD3wjjk9CxUrKsNOSaV
uqlRb+8PhVme9FQF9d+uM8jQOfjkx9wn4ToD3gy937mZUmphCXOiL55y8mP8h937
QjTrh5lMy0DRnDxfovNA4yyx4yXTxQ1jVYIvlDw6OpWgygW03tJPCE0TdjpfzGCd
XD0E9kxhj60l+LIKyVU+81QtmwKBgQDoEfYRBR6ru05C28hcgq1m8MpF6BqfxSOS
FrJ2IxOghQED/3NGUapWL1VdO1R4Yua+dFJvdFG41OZ9b5LskDC2m745I2V/430h
isxU06N3W4pBOQLrYdGY4XDBCmi/8dypuvqo34oxHfRhUgwGNQhGrRAtxQW4GWRu
nqh/Z1OctQKBgQDnn6769P+AxdBAU36sGk7y8JdpRjyr6zWmQOA2BvmlGZ2DnQlI
SzqmpO/6ju7/1NnZEDIHnUcfpVYun4K6xIGe9C0waxCVJeAXdMq/jeKaB4a0vZMv
m6BTBN1tfpmmMVg2aN3qvxL3r98Q8owccUAmpHByARVZ22/vv5uvd2LqIwKBgQDI
XfmeaFU64NWJVEmB1jHxFyUNhoC2QXecwowDA/YGOc/Oq9fTdt8i2mtRu9AKwRmI
htZF9KA6fVckJhkstrHYeE+c9brE2J1JQJV7B9+zRg3wklC6+hIFdV/szBf04dYr
lYymEZs3HS3KeRR4p4ElxHabjeiKMyJLgCDrH0NJoQKBgDUF+V24/c8IoLMjel9g
8+DwiNeEbp8XVtvndczynwoU/9k0hwMPAFH1CgN13m76WjWRZYXHF+D7SDj8fMvh
XopOGPu8wHN6jjk80uoXWSjivRcEiTBs6hxf6Jy/Pm8umIOeNWfUBdVciopaccZi
8BKLniAiiGiLF/HN5lZJrpWr
-----END PRIVATE KEY-----`;

let cachedToken = null;
let tokenExpiry = 0;

/** Convert PEM to CryptoKey */
async function importPrivateKey(pem) {
    const pemBody = pem
        .replace(/-----BEGIN PRIVATE KEY-----/, '')
        .replace(/-----END PRIVATE KEY-----/, '')
        .replace(/\s/g, '');
    const binaryDer = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
    return crypto.subtle.importKey(
        'pkcs8',
        binaryDer,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['sign']
    );
}

/** Base64url encode */
function base64url(data) {
    if (typeof data === 'string') {
        data = new TextEncoder().encode(data);
    }
    return btoa(String.fromCharCode(...new Uint8Array(data)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

/** Create and sign a JWT for Google APIs */
async function createJWT() {
    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = base64url(JSON.stringify({
        iss: CLIENT_EMAIL,
        scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
    }));

    const key = await importPrivateKey(PRIVATE_KEY);
    const signatureBytes = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        key,
        new TextEncoder().encode(`${header}.${payload}`)
    );
    const signature = base64url(signatureBytes);
    return `${header}.${payload}.${signature}`;
}

/** Get a valid access token (cached, auto-refreshes) */
export async function getAccessToken() {
    // Return cached token if still valid (with 5min buffer)
    if (cachedToken && Date.now() < tokenExpiry - 300000) {
        return cachedToken;
    }

    const jwt = await createJWT();
    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
    });

    const data = await response.json();
    if (!data.access_token) {
        throw new Error('Failed to get Google access token: ' + JSON.stringify(data));
    }

    cachedToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in * 1000);
    return cachedToken;
}
