const { google } = require('googleapis')
const fs   = require('fs')
const path = require('path')

async function test() {
  try {
    const auth  = new google.auth.GoogleAuth({
      keyFile: './credentials.json',
      scopes: ['https://www.googleapis.com/auth/drive'],
    })
    const drive = google.drive({ version: 'v3', auth })

    // Create a tiny test file
    const testContent = 'test screenshot content'
    const tmpPath = './downloads/test_screenshot.txt'
    fs.writeFileSync(tmpPath, testContent)

    console.log('Uploading test file to Drive...')
    const response = await drive.files.create({
      requestBody: {
        name:    'test_screenshot.txt',
        parents: ['13aksBYQ3sRnMh_oFKTAXagUr4h7xMD9E'],
      },
      media: {
        mimeType: 'text/plain',
        body: fs.createReadStream(tmpPath),
      },
      fields: 'id',
    })

    console.log('SUCCESS! File ID:', response.data.id)
    fs.unlinkSync(tmpPath)
  } catch (err) {
    console.log('ERROR:', err.message)
  }
}

test()
