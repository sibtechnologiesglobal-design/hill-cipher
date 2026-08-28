'use strict';

/**
 * Generates the project report as a .docx file.
 * The worked cipher example is computed live from the real implementation,
 * so every number in the math section is genuine.
 *
 * Usage: node scripts/generate-report.js
 */

const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ImageRun, PageBreak,
  ShadingType,
} = require('docx');

const {
  generateKeyMatrix, matrixInverseMod, modularInverse, determinantMod,
  encryptBlock, decryptBlock,
} = require('../server/lib/hillcipher');

const SHOTS = '/tmp/report-shots';
const OUT = path.join(__dirname, '..', 'Hill Cipher Project Report.docx');

// ---------------------------------------------------------------------------
// Live worked example (real numbers from the real code)
// ---------------------------------------------------------------------------
const DEMO_PW = 'demo';
const K = generateKeyMatrix(DEMO_PW);
const det = determinantMod(K, 256);
const detInv = modularInverse(det, 256);
const Kinv = matrixInverseMod(K, 256);
const P = [120, 200];
const C = encryptBlock(P, K);
const RECOVERED = decryptBlock(C, Kinv);

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const GREEN = '1F7A4D';
const DARK = '1a1a2e';

const h1 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 160 }, children: [new TextRun({ text, color: DARK })] });
const h2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 }, children: [new TextRun({ text, color: GREEN })] });
const p = (...runs) => new Paragraph({ spacing: { after: 120 }, children: runs.map((r) => (typeof r === 'string' ? new TextRun(r) : r)) });
const b = (text) => new TextRun({ text, bold: true });
const mono = (text) => new TextRun({ text, font: 'Courier New', size: 20 });
const monoPara = (text) => new Paragraph({
  spacing: { after: 80 },
  shading: { type: ShadingType.CLEAR, fill: 'F2F5F3' },
  children: [new TextRun({ text, font: 'Courier New', size: 20 })],
});
const bullet = (text) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 60 }, children: [typeof text === 'string' ? new TextRun(text) : text] });
const caption = (text) => new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 240 },
  children: [new TextRun({ text, italics: true, size: 18, color: '555555' })],
});

function img(file, width, height, type) {
  const data = fs.readFileSync(path.join(SHOTS, file));
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 120, after: 60 },
    children: [new ImageRun({ data, type, transformation: { width, height } })],
  });
}

const cellBorders = {
  top: { style: BorderStyle.SINGLE, size: 4, color: 'BBBBBB' },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: 'BBBBBB' },
  left: { style: BorderStyle.SINGLE, size: 4, color: 'BBBBBB' },
  right: { style: BorderStyle.SINGLE, size: 4, color: 'BBBBBB' },
};

function cell(text, { header = false, monoFont = false, width } = {}) {
  return new TableCell({
    borders: cellBorders,
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    shading: header ? { type: ShadingType.CLEAR, fill: 'E8F5EE' } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({
      children: [new TextRun({ text, bold: header, font: monoFont ? 'Courier New' : undefined, size: monoFont ? 18 : 20 })],
    })],
  });
}

const table = (rows) => new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------
const children = [];

// ---- Cover page ----
children.push(
  new Paragraph({ spacing: { before: 2400 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'HILL//CIPHER', bold: true, size: 72, color: GREEN })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: 'Image Encryption and Decryption using the Hill Cipher', size: 32 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: 'A Linear Algebra Course Project', size: 26, italics: true })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 480, after: 60 }, children: [new TextRun({ text: 'Instructor: Sir Farhan Ali', size: 26, bold: true })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 480 }, children: [new TextRun({ text: 'August 28, 2026', size: 22 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: 'Team Members', size: 26, bold: true })] }),
  ...[
    'Tashfeen (Team Lead)', 'Maroof', 'Rana Yousaf', 'Ahmed Mujatab', 'Shahmeer',
  ].map((name) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: name, size: 24 })] })),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 480 }, children: [new TextRun({ text: 'Live demo: https://hill-cipher-tawny.vercel.app', size: 20, color: GREEN })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Source code: https://github.com/sibtechnologiesglobal-design/hill-cipher', size: 20, color: GREEN })] }),
  new Paragraph({ children: [new PageBreak()] }),
);

// ---- Team & responsibilities ----
children.push(
  h1('1. Team Members and Task Distribution'),
  table([
    new TableRow({ children: [cell('Member', { header: true, width: 22 }), cell('Role', { header: true, width: 28 }), cell('Responsibilities', { header: true, width: 50 })] }),
    new TableRow({ children: [cell('Tashfeen (Lead)'), cell('Project Lead & Cryptography'), cell('Overall architecture, Hill cipher core module (key derivation from SHA-256, block encryption, matrix inversion mod 256), .enc file format design, task coordination and code review.')] }),
    new TableRow({ children: [cell('Maroof'), cell('Backend Engineering'), cell('Express server and REST API (/api/encrypt, /api/decrypt, /api/history), upload validation with Multer, sharp image pipeline, Supabase Storage and database integration.')] }),
    new TableRow({ children: [cell('Rana Yousaf'), cell('Frontend Engineering'), cell('User interface and cyberpunk theme, matrix-rain canvas, GSAP/Lenis animation choreography, before/after compare slider, in-browser (client-side) decryption for large files.')] }),
    new TableRow({ children: [cell('Ahmed Mujatab'), cell('Deployment & Infrastructure'), cell('GitHub repository setup, Vercel serverless deployment, environment variables and secrets handling, GitHub-to-Vercel continuous deployment pipeline.')] }),
    new TableRow({ children: [cell('Shahmeer'), cell('Testing & Documentation'), cell('Unit test suite (25 tests over the cipher core), automated browser testing of the live deployment, README and API documentation, this report.')] }),
  ]),
);

// ---- Abstract ----
children.push(
  h1('2. Abstract'),
  p('This project applies core linear algebra — matrix multiplication, determinants, matrix inversion, and modular arithmetic — to a practical problem: encrypting images. A web application was built in which a user uploads an image and a password; the application derives a 2×2 key matrix from the password, encrypts the image pixel data with the Hill cipher, and produces a downloadable encrypted file in a custom binary format (.enc). Supplying the same password later reconstructs the original image exactly, pixel for pixel. The application is deployed on Vercel with Supabase providing persistent storage of encrypted files and an encryption history, and includes a mathematically honest treatment of what happens when a wrong password is used.'),
);

// ---- Linear algebra ----
children.push(
  h1('3. The Linear Algebra Behind the Project'),
  h2('3.1 The Hill cipher'),
  p('The Hill cipher (Lester S. Hill, 1929) is a classical polygraphic cipher built entirely on linear algebra. Plaintext is grouped into fixed-size vectors, and each vector is multiplied by an invertible key matrix over a finite ring. We work in ',
    mono('Z_256'),
    ' — the integers modulo 256 — because every pixel channel value (R, G, B) is exactly one byte (0–255). Encryption of a pixel pair P is a single linear transformation:'),
  monoPara('C = K · P   (mod 256)'),
  p('and decryption is multiplication by the inverse matrix:'),
  monoPara('P = K⁻¹ · C   (mod 256)'),

  h2('3.2 Deriving the key matrix from a password'),
  p('The password is hashed with SHA-256, producing 32 bytes. The first four bytes a, b, c, d seed the key matrix:'),
  monoPara('K = [ a  b ]\n    [ c  d ]'),
  p('For decryption to exist, K must be invertible modulo 256. A matrix is invertible mod m exactly when ', mono('gcd(det K, m) = 1'), '. Since 256 = 2⁸, the only requirement is that ', b('det K must be odd'), '. Instead of retrying hashes, the implementation guarantees this by construction:'),
  bullet(new TextRun({ text: 'a and d are forced odd (bitwise OR with 1), so a·d is odd' })),
  bullet(new TextRun({ text: 'b is forced even (bitwise AND with 0xFE), so b·c is even' })),
  bullet(new TextRun({ text: 'det K = a·d − b·c = odd − even = odd, for every possible password' })),

  h2('3.3 Inverting the matrix: adjugate and modular inverse'),
  p('The 2×2 inverse uses the adjugate formula:'),
  monoPara('K⁻¹ = det(K)⁻¹ · [  d  −b ]   (mod 256)\n                 [ −c   a ]'),
  p('Here ', mono('det(K)⁻¹'), ' is not ordinary division — it is the ', b('modular multiplicative inverse'), ': the unique number x with ', mono('det(K) · x ≡ 1 (mod 256)'), '. It is computed with the extended Euclidean algorithm, which expresses gcd(det, 256) = 1 as a linear combination of det and 256; the coefficient of det, reduced mod 256, is the inverse.'),

  h2('3.4 Worked example (computed by the actual project code)'),
  p('For the password ', mono(`"${DEMO_PW}"`), ' the implementation derives:'),
  monoPara(`K = [ ${K[0][0]}  ${K[0][1]} ]      det(K) = ${det}  (odd ✓)\n    [ ${K[1][0]}  ${K[1][1]} ]      det(K)⁻¹ mod 256 = ${detInv}   (check: ${det} × ${detInv} mod 256 = ${(det * detInv) % 256})`),
  monoPara(`K⁻¹ = ${detInv} · [ ${K[1][1]}  ${256 - K[0][1] === 256 ? 0 : 256 - K[0][1]}  ]  mod 256  =  [ ${Kinv[0][0]}  ${Kinv[0][1]} ]\n      ${' '.repeat(String(detInv).length)}  [ ${256 - K[1][0]}  ${K[0][0]} ]${' '.repeat(11)}[ ${Kinv[1][0]}  ${Kinv[1][1]} ]`),
  p('Encrypting the pixel pair P = [', mono(`${P[0]}, ${P[1]}`), ']:'),
  monoPara(`C = K·P mod 256 = [ ${K[0][0]}·${P[0]} + ${K[0][1]}·${P[1]} ]  =  [ ${C[0]} ]\n                  [ ${K[1][0]}·${P[0]} + ${K[1][1]}·${P[1]} ]     [ ${C[1]} ]   (mod 256)`),
  p('Decrypting recovers the original exactly:'),
  monoPara(`P = K⁻¹·C mod 256 = [ ${RECOVERED[0]}, ${RECOVERED[1]} ]  ✓  (original was [ ${P[0]}, ${P[1]} ])`),

  h2('3.5 Why a wrong password produces noise, not an error'),
  p('Every password produces some valid, invertible matrix. Decryption with the wrong password is therefore still a well-defined linear transformation — just by an unrelated matrix — so it "succeeds" mathematically and outputs garbage pixels. The application detects this statistically: neighboring pixels of any real image are strongly correlated, while cipher output has correlation near zero. Measured on the live deployment: a wrong-password output had adjacent-pixel correlation r = 0.03 (flagged as noise, amber warning), while the correctly decrypted image measured r = 0.49 (accepted, success state). This distinction — "the algebra cannot tell, but statistics can" — is itself a demonstration of why modern cryptography adds integrity checks on top of raw ciphers.'),
);

// ---- Architecture ----
children.push(
  h1('4. System Architecture and Working'),
  h2('4.1 Encryption flow'),
  bullet('The browser uploads the image and password as multipart/form-data to POST /api/encrypt (Multer, in-memory, 4 MB limit).'),
  bullet('sharp decodes the image to raw RGB channels; alpha is dropped, grayscale expanded to RGB.'),
  bullet('Each channel is padded to even length, split into 2×1 pixel blocks, and every block is multiplied by K mod 256.'),
  bullet('The ciphertext is packed into the custom ENC1 container and returned as a download; a copy is archived to Supabase Storage with a metadata row (never the password or plaintext).'),
  h2('4.2 Decryption flow'),
  bullet('For normal files, POST /api/decrypt validates and parses the ENC1 header, rebuilds K from the password, computes K⁻¹, transforms every block, and re-encodes the image in its original format.'),
  bullet('For files larger than the hosting platform\u2019s ~4.5 MB request cap, the frontend decrypts entirely in the browser: it parses the .enc locally, derives the key with the Web Crypto API (SHA-256), applies K⁻¹ block-by-block, and renders the result to a canvas. Zero upload, no size limit, identical math (verified byte-for-byte against the server implementation).'),
  h2('4.3 The ENC1 binary format'),
  table([
    new TableRow({ children: [cell('Offset', { header: true, width: 12 }), cell('Field', { header: true, width: 22 }), cell('Size (bytes)', { header: true, width: 18 }), cell('Description', { header: true, width: 48 })] }),
    new TableRow({ children: [cell('0', { monoFont: true }), cell('Magic'), cell('4'), cell('"ENC1" — identifies the file type')] }),
    new TableRow({ children: [cell('4', { monoFont: true }), cell('Width'), cell('4'), cell('Image width, uint32 little-endian')] }),
    new TableRow({ children: [cell('8', { monoFont: true }), cell('Height'), cell('4'), cell('Image height, uint32 little-endian')] }),
    new TableRow({ children: [cell('12', { monoFont: true }), cell('Format length'), cell('1'), cell('Length of the format string')] }),
    new TableRow({ children: [cell('13', { monoFont: true }), cell('Format'), cell('variable'), cell('"png", "jpeg", etc. — restored on decryption')] }),
    new TableRow({ children: [cell('…', { monoFont: true }), cell('Ciphertext'), cell('remaining'), cell('Encrypted R, G, B channels, each padded to even length')] }),
  ]),
);

// ---- Technology stack ----
children.push(
  h1('5. Technologies Used'),
  table([
    new TableRow({ children: [cell('Technology', { header: true, width: 25 }), cell('Purpose in this project', { header: true, width: 75 })] }),
    new TableRow({ children: [cell('Node.js 22 + Express 4'), cell('Web server and REST API. All file processing happens in memory — nothing is written to disk, which is also what makes serverless deployment possible.')] }),
    new TableRow({ children: [cell('Multer 2'), cell('Multipart upload handling with strict MIME/extension validation and size limits (4 MB images, 50 MB .enc).')] }),
    new TableRow({ children: [cell('sharp (libvips)'), cell('High-performance image decoding to raw pixel data and re-encoding after decryption, preserving the original format.')] }),
    new TableRow({ children: [cell('Web Crypto API'), cell('SHA-256 in the browser, used to derive the key matrix client-side for the live key display and for in-browser decryption of large files.')] }),
    new TableRow({ children: [cell('Supabase'), cell('Persistence layer: a private Storage bucket (encrypted-files) archives ciphertext, and a Postgres table (encryption_history) records filename, size, and timestamp. Row Level Security is enabled with no public policies, so only the server (using the service_role key) can access data. The frontend "Recent encryptions" panel reads GET /api/history, proving persistence across requests. Persistence is best-effort by design: if Supabase is unreachable, encryption still succeeds.')] }),
    new TableRow({ children: [cell('Vercel'), cell('Serverless hosting of the whole app (API + static frontend) from one repository. The platform\u2019s read-only filesystem is satisfied by the in-memory design; its ~4.5 MB request cap motivated both the 4 MB upload limit and the in-browser decryption feature.')] }),
    new TableRow({ children: [cell('GitHub + CI/CD'), cell('Version control and automatic deployments: every push to main triggers a fresh Vercel production build (verified: a push deployed in ~15 seconds).')] }),
    new TableRow({ children: [cell('GSAP + ScrollTrigger, Lenis, typed.js, split-type, AOS, canvas-confetti'), cell('Animation layer: smooth scrolling, per-character hero animation, terminal typewriter, scroll reveals, and the success confetti. All progressive enhancement — the app works fully if any library fails to load.')] }),
    new TableRow({ children: [cell('Custom matrix-rain canvas'), cell('Hand-rolled falling-glyph background (~80 lines). During encryption it rains the actual key matrix bytes in hexadecimal and speeds up.')] }),
    new TableRow({ children: [cell('node:test'), cell('Unit test runner for the 25-test cipher suite — no external test dependency.')] }),
  ]),
);

// ---- Testing ----
children.push(
  h1('6. Testing and Verification'),
  bullet('25 unit tests over the cipher core: key matrices are invertible for 200+ fuzzed passwords; the modular inverse is correct for every odd value mod 256; K·K⁻¹ equals the identity; encrypt→decrypt round-trips are byte-identical for 1×1, 2×2, 3×3, 5×7, 64×48 and 101×33 images (covering all padding edge cases); corrupted and truncated .enc files are rejected with clear errors.'),
  bullet('Wrong-password behavior: over 90% of output bytes differ from the original, and adjacent-pixel correlation collapses to ≈0.'),
  bullet('Automated browser testing of the deployed site: encryption flow, server decryption, in-browser decryption of large files, wrong-password warning, error states, mobile layout (390×844), and the Supabase history panel.'),
  bullet('Live production verification: a 4.2 MB .enc decrypted on the hosted deployment with pixel-identical output; the Supabase bucket and history table were confirmed to contain the archived ciphertext and metadata.'),
);

// ---- Screenshots ----
children.push(
  h1('7. Screenshots'),
  img('hero.png', 600, 338, 'png'),
  caption('Figure 1 — Landing page: matrix-rain background, animated key matrix, and typewriter tagline.'),
  img('decrypt-success.png', 600, 338, 'png'),
  caption('Figure 2 — Successful decryption on the live deployment. The terminal shows the real pipeline steps; for this large file the work ran in-browser ("decrypting in-browser, zero upload").'),
  img('wrong-password.png', 600, 338, 'png'),
  caption('Figure 3 — Wrong password: the linear algebra "succeeds" but produces noise; the app detects the missing pixel correlation and warns instead of celebrating.'),
  img('mobile.jpg', 280, 608, 'jpg'),
  caption('Figure 4 — Mobile view during development: the server\u2019s 4.5 MB request cap rejecting a 23.73 MB encrypted 4K image (HTTP 413) — the finding that motivated the in-browser decryption feature.'),
  img('github.jpg', 600, 387, 'jpg'),
  caption('Figure 5 — Source repository on GitHub; every push auto-deploys to Vercel.'),
);

// ---- Limitations ----
children.push(
  h1('8. Known Limitations'),
  bullet('The Hill cipher is a teaching cipher, not modern cryptography: it is linear, so a known-plaintext attack can recover K from a few pixel pairs.'),
  bullet('Identical pixel blocks encrypt identically (ECB-like), so large flat-color areas can leave faint structure in the ciphertext.'),
  bullet('The .enc format carries no integrity check, so a wrong password cannot be rejected server-side — it is detected statistically in the UI instead.'),
  bullet('Lossy source formats (JPEG) are re-encoded on decryption: the recovered pixels are exact, but the saved file is not byte-identical to the original file.'),
  bullet('The hosted platform caps uploads at ~4.5 MB; larger encrypted files are handled by in-browser decryption, and unlimited sizes work when running locally.'),
);

// ---- Conclusion ----
children.push(
  h1('9. Conclusion'),
  p('The project demonstrates that a semester of linear algebra is enough to build a working encryption system: determinants decide invertibility, the adjugate and the extended Euclidean algorithm produce the inverse, and matrix multiplication over Z\u2082\u2085\u2086 scrambles and perfectly restores real images. Wrapping the mathematics in a polished, deployed product — with persistent cloud storage, a live history, automated deployments, and honest handling of failure cases — turned an abstract topic into something the whole class can try from their phones.'),
  p(b('Live demo: '), new TextRun({ text: 'https://hill-cipher-tawny.vercel.app', color: GREEN })),
  p(b('Source code: '), new TextRun({ text: 'https://github.com/sibtechnologiesglobal-design/hill-cipher', color: GREEN })),
);

// ---------------------------------------------------------------------------
const doc = new Document({
  creator: 'HILL//CIPHER Team',
  title: 'Hill Cipher Image Encryption — Project Report',
  description: 'Linear Algebra course project report',
  styles: {
    default: {
      document: { run: { font: 'Calibri', size: 22 } },
      heading1: { run: { size: 32, bold: true } },
      heading2: { run: { size: 26, bold: true } },
    },
  },
  sections: [{ properties: {}, children }],
});

Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(OUT, buffer);
  console.log('Report written:', OUT, `(${(buffer.length / 1024).toFixed(0)} KB)`);
});
