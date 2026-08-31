const { google } = require('googleapis');
const fs = require('fs');
const readline = require('readline');
require('dotenv').config();

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/youtube.force-ssl'],
});

console.log('Authorize this app by visiting this URL:', authUrl);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

rl.question('Enter the name for this user (e.g., user1, user2): ', (username) => {
    rl.question('Enter the code from that page here: ', async (code) => {
        try {
            const { tokens } = await oauth2Client.getToken(code);
            oauth2Client.setCredentials(tokens);

            if (!fs.existsSync('tokens')) {
                fs.mkdirSync('tokens');
            }

            fs.writeFileSync(`tokens/${username}.json`, JSON.stringify(tokens, null, 2));
            console.log(`✅ Refresh token stored for ${username}`);
        } catch (error) {
            console.error('❌ Error retrieving access token', error);
            console.log('Please try again or check your credentials.');
        }
        rl.close();
    });
});
