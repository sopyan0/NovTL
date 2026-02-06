
import { createClient } from '@supabase/supabase-js';

// Handler untuk Vercel Serverless Function
// Kita tambahkan ': any' agar TypeScript tidak complain saat build Vercel
export default async function handler(req: any, res: any) {
  // Hanya terima method POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Missing Authorization header' });
    }

    // 1. Inisialisasi Supabase Admin (Punya akses penuh ke DB)
    // Pastikan env var SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY ada di Vercel
    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    // 2. Cek User yang request (Validasi Token Supabase User)
    // Kita cek apakah user valid menggunakan token JWT yang dikirim dari frontend
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized user' });
    }

    // 3. Ambil Google Refresh Token milik user ini dari tabel database
    const { data: tokenData, error: dbError } = await supabaseAdmin
      .from('user_tokens')
      .select('refresh_token')
      .eq('user_id', user.id)
      .single();

    if (dbError || !tokenData) {
      return res.status(404).json({ error: 'Refresh token not found in database. Please login again.' });
    }

    // 4. Minta Access Token Baru ke Google
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.status(500).json({ error: 'Server misconfiguration (Missing Google Keys)' });
    }

    const googleResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: tokenData.refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    const googleData = await googleResponse.json();

    if (googleData.error) {
      return res.status(400).json({ error: googleData.error_description || 'Google refresh failed' });
    }

    // 5. Kembalikan Access Token baru ke Frontend
    return res.status(200).json({ 
      access_token: googleData.access_token,
      expires_in: googleData.expires_in 
    });

  } catch (error) {
    console.error("API Error:", error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
