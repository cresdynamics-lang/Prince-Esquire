import { NextApiRequest, NextApiResponse } from 'next';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { query } from '../../../server/db';

const JWT_SECRET = process.env.JWT_SECRET ?? "local-postgres-secret";

function verifyToken(token: string) {
  return jwt.verify(token, JWT_SECRET) as { userId: string; email: string };
}

function getBearerToken(req: NextApiRequest) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  return authHeader.replace(/^Bearer\s+/, "");
}

async function requireAuth(req: NextApiRequest, res: NextApiResponse): Promise<{ id: string; email: string } | null> {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }

  try {
    const payload = verifyToken(token);
    const { rows } = await query(
      `SELECT id, email, raw_user_meta_data FROM auth.users WHERE id = $1 LIMIT 1`,
      [payload.userId],
    );
    const user = rows[0];
    if (!user) {
      res.status(401).json({ error: "Invalid session" });
      return null;
    }
    return { id: user.id, email: user.email };
  } catch (error: any) {
    res.status(401).json({ error: error?.message ?? "Unauthorized" });
    return null;
  }
}

async function isAdmin(userId: string) {
  const { rows } = await query(`SELECT role FROM public.user_roles WHERE user_id = $1`, [userId]);
  return rows.some((row: any) => row.role === "admin");
}

function formatPhone(input: string) {
  const cleaned = input.replace(/[^\d]/g, "");
  if (cleaned.startsWith("254")) return cleaned;
  if (cleaned.startsWith("0")) return `254${cleaned.slice(1)}`;
  if (cleaned.startsWith("7") || cleaned.startsWith("1")) return `254${cleaned}`;
  return cleaned;
}

function timestamp() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await requireAuth(req, res);
  if (!auth) return;

  const name = req.query.name as string;

  try {
    if (name === "create-attendant-user") {
      if (!(await isAdmin(auth.id))) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const body = req.body;
      const email = String(body.email ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      const display_name = String(body.display_name ?? "").trim();
      const branch_location = body.branch_location ?? null;
      const orders_visibility = body.orders_visibility === "branch" ? "branch" : "all";
      const permissions = body.permissions ?? {};
      const is_active = body.is_active !== false;

      if (!email || !password || password.length < 6) {
        return res.status(400).json({ error: "Email and password are required." });
      }
      if (!display_name) {
        return res.status(400).json({ error: "Display name is required." });
      }

      const existing = await query(`SELECT id FROM auth.users WHERE email = $1 LIMIT 1`, [email]);
      if (existing.rows.length > 0) {
        return res.status(400).json({ error: "User already exists." });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const insertUser = await query(
        `INSERT INTO auth.users (email, password_hash, raw_user_meta_data) VALUES ($1, $2, $3) RETURNING id`,
        [email, passwordHash, JSON.stringify({ display_name })],
      );
      const userId = insertUser.rows[0].id;
      await query(`INSERT INTO public.user_roles (user_id, role) VALUES ($1, 'staff')`, [userId]);
      await query(
        `INSERT INTO public.attendant_profiles (user_id, email, display_name, branch_location, is_active, orders_visibility, permissions) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [userId, email, display_name, branch_location, is_active, orders_visibility, JSON.stringify(permissions)],
      );
      await query(
        `INSERT INTO public.admin_activity_log (user_id, action, entity_type, entity_id, metadata) VALUES ($1, 'attendant_created', 'attendant_profile', $2, $3)`,
        [auth.id, userId, JSON.stringify({ email, display_name, branch_location, orders_visibility, permissions })],
      );
      return res.json({ data: { ok: true, user_id: userId } });
    }

    if (name === "create-mpesa-stk") {
      const consumerKey = process.env.MPESA_CONSUMER_KEY;
      const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
      const passkey = process.env.MPESA_PASSKEY;
      const shortcode = process.env.MPESA_SHORTCODE;
      const callbackUrl = process.env.MPESA_CALLBACK_URL;
      const env = (process.env.MPESA_ENV ?? "sandbox").toLowerCase();

      if (!consumerKey || !consumerSecret || !passkey || !shortcode || !callbackUrl) {
        return res.status(500).json({ error: "Missing M-Pesa configuration." });
      }

      const body = req.body as { phone: string; amount: number; orderNumber: string };
      const phone = formatPhone(body.phone ?? "");
      const amount = Math.max(1, Math.round(Number(body.amount ?? 0)));
      const orderNumber = body.orderNumber ?? "ORDER";
      if (!phone || Number.isNaN(amount)) {
        return res.status(400).json({ error: "Invalid phone or amount." });
      }
      const baseUrl = env === "live" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
      const authRes = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
        method: "GET",
        headers: { Authorization: `Basic ${Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64")}` },
      });
      const authData = await authRes.json();
      if (!authRes.ok || !authData?.access_token) {
        return res.status(400).json({ error: "Could not authorize M-Pesa request.", details: authData });
      }
      const ts = timestamp();
      const password = Buffer.from(`${shortcode}${passkey}${ts}`).toString("base64");
      const stkRes = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authData.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          BusinessShortCode: shortcode,
          Password: password,
          Timestamp: ts,
          TransactionType: "CustomerPayBillOnline",
          Amount: amount,
          PartyA: phone,
          PartyB: shortcode,
          PhoneNumber: phone,
          CallBackURL: callbackUrl,
          AccountReference: orderNumber,
          TransactionDesc: `Prince Esquire ${orderNumber}`,
        }),
      });
      const stkData = await stkRes.json();
      if (!stkRes.ok || stkData?.ResponseCode !== "0") {
        return res.status(400).json({ error: stkData?.errorMessage || stkData?.ResponseDescription || "STK push failed", details: stkData });
      }
      return res.json({ data: { merchantRequestId: stkData.MerchantRequestID, checkoutRequestId: stkData.CheckoutRequestID, customerMessage: stkData.CustomerMessage } });
    }

    if (name === "create-stripe-checkout") {
      const stripeSecret = process.env.STRIPE_SECRET_KEY;
      if (!stripeSecret) {
        return res.status(500).json({ error: "Missing STRIPE_SECRET_KEY" });
      }
      const body = req.body as {
        orderNumber: string;
        lineItems: { title: string; quantity: number; unitAmountKes: number }[];
        successUrl: string;
        cancelUrl: string;
      };
      const lineItems = body.lineItems.map((item) => ({
        price_data: {
          currency: "kes",
          product_data: { name: item.title },
          unit_amount: Math.round(item.unitAmountKes * 100),
        },
        quantity: item.quantity,
      }));
      const params = new URLSearchParams();
      params.append("mode", "payment");
      params.append("success_url", body.successUrl);
      params.append("cancel_url", body.cancelUrl);
      params.append("client_reference_id", body.orderNumber);
      lineItems.forEach((li, index) => {
        params.append(`line_items[${index}][price_data][currency]`, li.price_data.currency);
        params.append(`line_items[${index}][price_data][product_data][name]`, li.price_data.product_data.name);
        params.append(`line_items[${index}][price_data][unit_amount]`, String(li.price_data.unit_amount));
        params.append(`line_items[${index}][quantity]`, String(li.quantity));
      });
      const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeSecret}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });
      const stripeData = await stripeRes.json();
      if (!stripeRes.ok) {
        return res.status(400).json({ error: stripeData?.error?.message || "Stripe error", details: stripeData });
      }
      return res.json({ data: { url: stripeData.url } });
    }

    return res.status(404).json({ error: "Function not found" });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message ?? "Server error" });
  }
}