// backend/server.js
const express = require('express');
const cors = require('cors');  // Add this at the top
const fs = require('fs');
const path = require('path');
const app = express();
const { exec } = require('child_process'); // Add this line at top with other imports
const mongoose = require('mongoose');

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/Face';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch((err) => console.error('❌ MongoDB connection failed:', err));

const { Schema } = mongoose;

// Update User Schema
const userSchema = new Schema({
  name: { 
    type: String, 
    required: true 
  },
  email: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true,
    lowercase: true
  },
  userId: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true 
  },
  faceEncoding: { 
    type: Array, 
    required: true 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
}, {
  // Add this to prevent other fields from being saved
  strict: true
});

// Update pre-save validation
userSchema.pre('save', function(next) {
  if (!this.name || !this.email || !this.userId || !this.faceEncoding) {
    return next(new Error('All fields are required'));
  }
  next();
});

// Create User model
const User = mongoose.model('User', userSchema);

// Add helper function for face comparison
function findMatchingUser(newFaceEncoding) {
  return User.find().then(users => {
    for (const user of users) {
      const distance = euclideanDistance(newFaceEncoding, user.faceEncoding);
      if (distance < 0.6) { // Threshold for face matching
        return user;
      }
    }
    return null;
  });
}

function euclideanDistance(array1, array2) {
  return Math.sqrt(
    array1.reduce((sum, val, i) => sum + Math.pow(val - array2[i], 2), 0)
  );
}

// Serve frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// Parse JSON bodies (limit increased for image)
app.use(express.json({ limit: '10mb' }));

// Replace the existing CORS middleware with this:
app.use(cors({
  origin: 'https://facial-3.onrender.com',  // Your frontend URL hosted on Render
  methods: ['GET', 'POST'],  // Add other methods if needed
}));

app.use(express.json({ limit: '10mb' }));

// Registration endpoint
app.post('/register', (req, res) => {
  const { image, name, email, userId } = req.body;
  console.log('📝 Registration attempt:', { name, email, userId });
  
  if (!image || !name || !email || !userId) {
    console.log('❌ Missing fields:', { 
      hasImage: !!image, 
      hasName: !!name, 
      hasEmail: !!email, 
      hasUserId: !!userId 
    });
    return res.status(400).send('Missing required fields');
  }

  const base64Data = image.replace(/^data:image\/png;base64,/, '');
  const savePath = path.join(__dirname, '../python/captured.png');
  
  fs.writeFile(savePath, base64Data, 'base64', async (err) => {
    if (err) {
      console.error('❌ Image save error:', err);
      return res.status(500).send('Image save failed');
    }
    console.log('✅ Image saved at:', savePath);
  const recognizerPath = path.join(__dirname, '../python/recognizer.py'); // Adjusted path
  exec(`python ${recognizerPath} ../python/captured.png`, async (err, stdout, stderr) => {
      if (err) {
        console.error('❌ Python execution error:', err);
        return res.status(500).send('Face detection failed');
      }
      if (stderr) {
        console.error('❌ Python stderr:', stderr);
      }

      console.log('🐍 Python stdout:', stdout);
      const lines = stdout.toString().trim().split('\n');
      console.log('📊 Parsed lines:', lines);

      if (lines[0].replace('\r', '').toLowerCase() === 'success' && lines[1]) {
        try {
          const faceEncoding = JSON.parse(lines[1]);
          console.log('✅ Face encoding parsed successfully');
          
          // Check if face already exists
          const existingUser = await findMatchingUser(faceEncoding);
          if (existingUser) {
            console.log('❌ Face already exists for user:', existingUser.email);
            return res.send('❌ Face already registered');
          }
          console.log('✅ No existing face found, proceeding with registration');

          const newUser = new User({
            name,
            email,
            userId,
            faceEncoding
          });

          try {
            await newUser.save();
            console.log('✅ User saved successfully:', { name, email, userId });
            res.send('✅ User registered successfully');
          } catch (dbError) {
            console.error('❌ Database save error:', dbError);
            if (dbError.code === 11000) {
              // Check which field caused the duplicate error
              const field = Object.keys(dbError.keyPattern)[0];
              res.status(400).send(`Registration failed: ${field} already exists`);
            } else {
              res.status(500).send(`Registration failed: ${dbError.message}`);
            }
          }
        } catch (parseError) {
          console.error('❌ Face encoding parse error:', parseError);
          res.status(500).send('Registration failed: Invalid face encoding');
        }
      } else {
        console.log('❌ No face detected in image');
        res.send('❌ No face detected');
      }
    });
  });
});

// Update login endpoint
app.post('/login', (req, res) => {
  const { image } = req.body;
  if (!image) return res.status(400).send('No image provided');

  const base64Data = image.replace(/^data:image\/png;base64,/, '');
  const savePath = path.join(__dirname, '../python/captured.png');
  
  fs.writeFile(savePath, base64Data, 'base64', async (err) => {
    if (err) return res.status(500).send('Image save failed');

    exec(`python ../python/recognizer.py ../python/captured.png`, async (err, stdout) => {
      if (err) return res.status(500).send('Face detection failed');

      const lines = stdout.toString().trim().split('\n');
      if (lines[0].replace('\r', '').toLowerCase() === 'success' && lines[1]) {
        try {
          const faceEncoding = JSON.parse(lines[1]);
          const matchingUser = await findMatchingUser(faceEncoding);
          
          if (matchingUser) {
            res.send(`✅ Welcome back, ${matchingUser.name}!`);
          } else {
            res.send('❌ User not found');
          }
        } catch (error) {
          res.status(500).send('Login failed');
        }
      } else {
        res.send('❌ No face detected');
      }
    });
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
