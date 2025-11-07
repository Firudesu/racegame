# 🚀 Supabase Setup Guide - Step by Step

## Step 1: Get Your Supabase Credentials

1. Go to: https://supabase.com/dashboard
2. Click on your project (or create a new one if you haven't)
3. On the left sidebar, click **"Project Settings"** (gear icon at bottom)
4. Click **"API"** in the settings menu

You'll see a section called **"Project API keys"**

**I need these TWO things:**

### A) Project URL
- Look for: `URL`
- It looks like: `https://xxxxxxxxxx.supabase.co`
- Copy this entire URL

### B) Anon/Public Key  
- Look for: `anon` `public` key
- It's a LONG string starting with `eyJ...`
- This is safe to use in frontend code
- Copy this entire key

---

## Step 2: Tell Me These Values

Just send me:
```
URL: https://xxxxxxxxxx.supabase.co
KEY: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSI...
```

**Note:** These are safe to share with me - the anon key is meant for frontend use.

---

## What I'll Do Next:

Once you give me those, I'll:
1. Create a Supabase config file
2. Set up the database tables (I'll give you SQL to run)
3. Build the multiplayer system
4. Test it all works

---

## Need Help Finding It?

If you're stuck, tell me what you see on your screen and I'll guide you!
