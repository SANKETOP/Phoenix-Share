const express = require('express');
const bodyParser = require('body-parser');
const fileUpload = require('express-fileupload');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const qrCode = require('qrcode');
const config = require('./config.json');
const db = require('quick.db');
const bcrypt = require('bcrypt');


const app = express();

app.use(bodyParser.urlencoded({ extended: false }));
// Set the upload limit (default: 200MB)
const uploadLimit = 200 * 1024 * 1024;
app.use(fileUpload({
  limits: { fileSize: uploadLimit }
}));

// Serve the login page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

// Handle login form submission
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  // Retrieve the user object from the database
  const user = db.get(`users.${username}`);

  // Check if the user exists
  if (!user) {
    return res.status(400).send('Invalid username or password');
  }

  // Compare the provided password with the stored hashed password
  bcrypt.compare(password, user.password, (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Internal Server Error');
    }

    if (result) {
      // Passwords match, user is authenticated
      return res.redirect('/upload');
    } else {
      // Passwords do not match
      return res.status(400).send('Invalid username or password');
    }
  });
});

// Serve the account creation page
app.get('/create-account', (req, res) => {
  res.sendFile(path.join(__dirname, 'create-account.html'));
});

// Handle account creation form submission
app.post('/create-account', (req, res) => {
  const { username, password } = req.body;

  // Check if the username is already taken
  if (db.has(`users.${username}`)) {
    return res.status(400).send('Username already taken');
  }

  // Generate a salt and hash the password
  bcrypt.genSalt(10, (err, salt) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Internal Server Error');
    }

    bcrypt.hash(password, salt, (err, hash) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Internal Server Error');
      }

      // Create a new user object with the hashed password
      const user = {
        username: username,
        password: hash
      };

      // Store the user object in the database
      db.set(`users.${username}`, user);

      // Redirect to the login page after successful account creation
      res.redirect('/');
    });
  });
});
    
// Serve the upload form page
app.get('/upload', (req, res) => {
  res.sendFile(path.join(__dirname, 'upload.html'));
});

// Handle file upload
app.post('/upload', async (req, res) => {
  // Check if a file was uploaded
  if (!req.files || !req.files.file) {
    return res.status(400).send('No file was uploaded.');
  }

  const file = req.files.file;
  const fileExtension = path.extname(file.name);
  const validExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.mp4', '.mov', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.zip'];

  // Check if the file extension is valid
  if (!validExtensions.includes(fileExtension)) {
    return res.status(400).send('Invalid file type. Only PDF, images, videos, Microsoft Office files, and ZIP files are allowed.');
  }

  const fileName = `${uuidv4()}${fileExtension}`;
  const filePath = path.join(__dirname, 'uploads', fileName);
  const downloadLink = `${config.domain}/download/${fileName}`;

  // Move the uploaded file to the server
  file.mv(filePath, async (err) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Error occurred while uploading the file.');
    }

    // Generate the QR code image
    const qrCodeImage = await qrCode.toDataURL(downloadLink);

    // Display the file name, download link, and QR code on the upload success page
    res.send(`
      <h2>File uploaded successfully!</h2>
      <p>File name: ${file.name}</p>
      <p>Download link: <a href="${downloadLink}">${downloadLink}</a></p>
      <img src="${qrCodeImage}" alt="QR Code">

      <script>
        // Auto delete the file after 15 minutes
        setTimeout(() => {
          fetch('/delete', {
            method: 'POST',
            body: JSON.stringify({ filePath }),
            headers: {
              'Content-Type': 'application/json'
            }
          }).then(() => {
            console.log('File deleted successfully');
          }).catch((error) => {
            console.error('Error occurred while deleting the file:', error);
          });
        }, 15 * 60 * 1000);

        // Auto delete the file after download
        const downloadLinkElement = document.querySelector('a');
        downloadLinkElement.addEventListener('click', () => {
          fetch('/delete', {
            method: 'POST',
            body: JSON.stringify({ filePath }),
            headers: {
              'Content-Type': 'application/json'
            }
          }).then(() => {
            console.log('File deleted successfully');
          }).catch((error) => {
            console.error('Error occurred while deleting the file:', error);
          });
        });
      </script>
    `);
  });
  
});


// Handle file download
app.get('/download/:fileName', (req, res) => {
  const { fileName } = req.params;
  const filePath = path.join(__dirname, 'uploads', fileName);

  res.download(filePath, (err) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Error occurred while downloading the file.');
    }

    // Delete the file after download
    deleteFile(filePath);
  });
});

// Handle file deletion
app.post('/delete', (req, res) => {
  const { filePath } = req.body;

  deleteFile(filePath);
  res.status(200).send('File deleted successfully.');
});

// Delete file
function deleteFile(filePath) {
  fs.unlink(filePath, (err) => {
    if (err) {
      console.error(err);
    } else {
      console.log('File deleted successfully');
    }
  });
}

// Start the server
app.listen(config.port, () => {
  console.log(`Server started on port ${config.port}`);
});
  //end