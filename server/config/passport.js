const passport = require('passport');

// Only register Google strategy if real credentials are configured
const clientID     = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

const isGoogleConfigured =
  clientID &&
  clientSecret &&
  clientID !== 'your_google_client_id' &&
  clientSecret !== 'your_google_client_secret';

if (isGoogleConfigured) {
  const GoogleStrategy = require('passport-google-oauth20').Strategy;
  const User = require('../models/User');

  passport.use(
    new GoogleStrategy(
      {
        clientID,
        clientSecret,
        callbackURL: `${process.env.SERVER_URL || 'http://localhost:5000'}/api/auth/google/callback`,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          let user = await User.findOne({ googleId: profile.id });
          if (user) return done(null, user);

          const email = profile.emails?.[0]?.value;
          user = await User.findOne({ email });
          if (user) {
            user.googleId = profile.id;
            if (!user.avatar && profile.photos?.[0]?.value) user.avatar = profile.photos[0].value;
            await user.save();
            return done(null, user);
          }

          const newUser = new User({
            name: profile.displayName,
            email: email || `${profile.id}@google.com`,
            password: Math.random().toString(36).slice(-12) + '!A1',
            avatar: profile.photos?.[0]?.value || '',
            googleId: profile.id,
          });
          await newUser.save();
          return done(null, newUser);
        } catch (error) {
          return done(error, null);
        }
      }
    )
  );
} else {
  console.log('[Passport] Google OAuth not configured — skipping Google strategy. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env to enable it.');
}

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const User = require('../models/User');
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

module.exports = passport;

