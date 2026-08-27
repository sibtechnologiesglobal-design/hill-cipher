# HILL//CIPHER — Image Encryption via Linear Algebra

A web app that encrypts and decrypts images with the **Hill cipher**: every pair of
pixel values is multiplied by a 2×2 key matrix and reduced mod 256. Upload an image
and a password, download an encrypted `.enc` file; upload the `.enc` with the same
password, get your image back — pixel-for-pixel exact.

Built as a university linear algebra term project. Cyberpunk terminal UI with
matrix-rain background, GSAP/Lenis animation, a live visualization of the actual
matrix math while your request is in flight, and a before/after compare slider.

## Setup & run

Requires Node.js 20.6+ (developed on 22).

```bash
npm install        # also copies frontend libs into public/vendor (postinstall)
npm start          # serves http://localhost:3000
npm test           # runs the cipher test suite (node:test, no extra deps)
npm run dev        # auto-restarting dev server
```

Open http://localhost:3000, drop in an image, type a password, hit ENCRYPT.

Supabase persistence is **optional** locally: without credentials the app runs
fine and simply hides the "Recent encryptions" panel. To enable it, create a
`.env` in the project root (gitignored, loaded automatically by `npm start`):

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## The math, in plain English

The Hill cipher (Lester S. Hill, 1929) is a classical cipher built entirely from
linear algebra. This app applies it to raw pixel bytes, working in
**Z₂₅₆** — the integers mod 256, a natural fit since pixel channel values are bytes.

**1. Password → key matrix.** The password is hashed with SHA-256. The first four
bytes of the digest become the entries of a 2×2 matrix

```
K = [ a  b ]
    [ c  d ]
```

**2. Why the determinant must be odd.** To decrypt we need K⁻¹ to exist *mod 256*.
A matrix is invertible mod m exactly when gcd(det K, m) = 1. Since 256 = 2⁸, that
means det K just has to be **odd**. We guarantee it constructively: `a` and `d` are
forced odd (`| 1`) and `b` forced even (`& 0xFE`), so

```
det K = a·d − b·c  =  odd·odd − even·c  =  odd − even  =  odd   ✓
```

Every password yields a valid, invertible key — no retry loop, no failure case.

**3. Encryption.** The image is decoded to raw R, G, B channels. Each channel is a
byte array; it's padded to even length and split into 2×1 blocks (pairs of pixels).
Each block P is encrypted as

```
C = K · P  (mod 256)
```

Two multiplications and an addition per output byte — and the image becomes
statistical noise, because every output byte depends on two input bytes *and* four
secret key bytes.

**4. Decryption.** We invert K using the adjugate formula for 2×2 matrices:

```
K⁻¹ = det(K)⁻¹ · [  d  −b ]     (mod 256)
                 [ −c   a ]
```

`det(K)⁻¹` is the **modular inverse** — the number x with `det·x ≡ 1 (mod 256)` —
found with the extended Euclidean algorithm. Then `P = K⁻¹ · C (mod 256)` recovers
every original pixel exactly. A wrong password derives a different K, so the
"decryption" is just multiplication by an unrelated matrix: the output is noise.
The UI detects this with an adjacent-pixel correlation test (real images have
strongly correlated neighboring pixels; cipher output has correlation ≈ 0) and
shows a clear warning instead of celebrating.

## The `.enc` file format

| Offset | Field         | Size     | Description                       |
|--------|---------------|----------|-----------------------------------|
| 0      | Magic         | 4        | `"ENC1"`                          |
| 4      | Width         | 4        | uint32 little-endian              |
| 8      | Height        | 4        | uint32 little-endian              |
| 12     | Format length | 1        | length of the format string       |
| 13     | Format        | variable | `"png"`, `"jpeg"`, …              |
| …      | Ciphertext    | rest     | encrypted R, then G, then B, each padded to even length |

## API

All endpoints return JSON errors `{ "error": "…" }` with appropriate status codes
(400 bad input, 413 too large, 415 wrong file type, 500 server fault).
Uploads are processed entirely in memory — nothing is ever written to local disk,
which is also what makes the app deployable to read-only serverless filesystems.
When Supabase is configured, the encrypted output (never the plaintext image or
password) is archived to storage and a metadata row is recorded.

### `POST /api/encrypt`

| Field      | Type   | Notes                                        |
|------------|--------|----------------------------------------------|
| `image`    | file   | png / jpeg / webp / gif / tiff / avif, ≤4 MB |
| `password` | string | required                                     |

```bash
curl -o photo.enc \
  -F "image=@photo.png" \
  -F "password=hunter2" \
  http://localhost:3000/api/encrypt
```

### `POST /api/decrypt`

| Field      | Type   | Notes                    |
|------------|--------|--------------------------|
| `file`     | file   | a `.enc` file, ≤50 MB    |
| `password` | string | required                 |

> `.enc` files hold uncompressed pixel data, so they are usually larger than
> the source image — hence the higher decrypt limit. On the hosted (Vercel)
> version, the platform rejects request bodies above ~4.5 MB regardless of
> this limit; larger `.enc` files decrypt fine when running locally.

```bash
curl -o photo.png \
  -F "file=@photo.enc" \
  -F "password=hunter2" \
  http://localhost:3000/api/decrypt
```

### `GET /api/history`

Returns the 10 most recent encryptions — metadata only (no storage paths, no
file contents). When Supabase isn't configured: `{ "configured": false, "items": [] }`.

```bash
curl http://localhost:3000/api/history
# → {"configured":true,"items":[{"original_filename":"photo.png","file_size_bytes":6928,"created_at":"…"}]}
```

Error example:

```bash
curl -F "file=@garbage.enc" -F "password=x" http://localhost:3000/api/decrypt
# → 400 {"error":"Invalid .enc file: bad magic bytes (expected \"ENC1\")"}
```

## Deployment (Vercel + Supabase)

The whole app — API and UI — deploys as **one Vercel project**: Express serves
the static frontend, and `vercel.json` routes everything through a single
serverless function. Nothing touches the local filesystem at runtime, which is
required since Vercel functions are read-only outside a per-invocation `/tmp`.

### 1. Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. **Storage** → New bucket → name `encrypted-files`, public **OFF**.
3. **SQL Editor** → run `supabase/schema.sql` from this repo (creates the
   `encryption_history` table and locks it behind RLS).
4. Copy from **Settings → API**: the project URL and the `service_role` key.

### 2. Environment variables

| Variable                    | Purpose                                    |
|-----------------------------|--------------------------------------------|
| `SUPABASE_URL`              | your Supabase project URL                  |
| `SUPABASE_SERVICE_ROLE_KEY` | server-side storage/DB access (bypasses RLS) |

> **The `service_role` key is server-only.** It grants full database access.
> Set it in Vercel's dashboard (Project → Settings → Environment Variables) or
> in a local `.env` — both are outside the repo. Never commit it, never ship it
> to the browser. This app only ever reads it in server code.

### 3. Deploy

```bash
npm i -g vercel
vercel            # link the project, then set the env vars in the dashboard
vercel --prod
```

Notes:

- `vercel.json` points the build at `server/server.js` and bundles `public/**`
  (including `public/vendor`, generated by `npm install`'s postinstall hook)
  into the function.
- The 4 MB upload limit exists because Vercel's Hobby plan rejects request
  bodies above ~4.5 MB — the app enforces it locally too so behavior matches.
- `sharp` ships prebuilt Linux binaries and works on Vercel out of the box.
- Supabase persistence is best-effort by design: if storage is down, encryption
  and download still succeed; only the history entry is skipped.

## Tests

`npm test` runs `tests/hillcipher.test.js` (Node's built-in test runner + assert):

- key matrix is invertible mod 256 for 200+ fuzzed passwords
- modular inverse correct for every odd value mod 256, null for non-coprime
- K·K⁻¹ ≡ identity
- encrypt→decrypt round-trips return *byte-identical* pixels for 1×1, 2×2, 3×3,
  5×7, 64×48 and 101×33 images (padding edge cases included)
- wrong password produces >90% differing bytes
- corrupted / truncated / bad-magic `.enc` files are rejected with clear errors
- jpeg format is preserved through the container

## Known limitations

- **This is a teaching cipher, not real security.** The Hill cipher is linear, so
  a known-plaintext attack recovers K from just a few pixel pairs. Use it to learn
  linear algebra, not to protect secrets.
- **No integrity check in the format.** A wrong password can't be *proven* wrong
  server-side — decryption always "succeeds" mathematically and produces noise.
  The UI flags it with a correlation heuristic instead. (Adding an HMAC would fix
  this but was deliberately left out to keep the format exactly as specified.)
- **Identical blocks encrypt identically** (ECB-like behavior). Large flat-color
  areas can leave faint structural traces in the ciphertext.
- **JPEG re-encoding.** Decrypted pixel data is exact, but if the original was a
  lossy format the decrypted file is re-encoded (jpeg → jpeg), so the *file* isn't
  byte-identical to the original even though the decrypted pixels are.
- **Alpha channels are dropped** — the cipher operates on R, G, B only.
- 4 MB image upload limit (matches Vercel Hobby's ~4.5 MB request body cap);
  decrypt accepts `.enc` files up to 50 MB, but on the hosted version Vercel's
  platform cap still applies — big files are a local-mode feature. Processing
  is in-RAM, so very large files cost memory.
- The encryption history lists filename/size/time for everyone — there's no auth
  or per-user scoping. Encrypted blobs sit in a private bucket and are never
  exposed through the API, but don't treat filenames as secrets.
