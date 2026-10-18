// Transfer helpers: IBAN checks and the EPC ("SEPA") payment QR code that
// banking apps scan to open a pre-filled transfer. Future Me never moves money
// itself; the user confirms the transfer in their own banking app.
var FMT = (function () {
  const REFERENCE = 'Future Me';

  function cleanIban(raw) {
    return String(raw || '').replace(/\s+/g, '').toUpperCase();
  }

  // ISO 13616 check: country code, check digits, mod 97 = 1.
  function ibanValid(raw) {
    const iban = cleanIban(raw);
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
    const moved = iban.slice(4) + iban.slice(0, 4);
    let rest = 0;
    for (const ch of moved) {
      const code = ch >= 'A' && ch <= 'Z' ? String(ch.charCodeAt(0) - 55) : ch;
      for (const d of code) rest = (rest * 10 + Number(d)) % 97;
    }
    return rest === 1;
  }

  function formatIban(raw) {
    return cleanIban(raw).replace(/(.{4})/g, '$1 ').trim();
  }

  function maskIban(raw) {
    const iban = cleanIban(raw);
    if (iban.length < 8) return formatIban(iban);
    return iban.slice(0, 4) + ' \u2026 ' + iban.slice(-4);
  }

  function ready(settings) {
    return !!(settings && settings.transferName && ibanValid(settings.transferIban));
  }

  // EPC069-12 "Quick Response Code" guidelines, version 002 (BIC optional in the EEA).
  function epcPayload(name, iban, amount, reference) {
    const amt = Math.round(Number(amount) * 100) / 100;
    if (!(amt >= 0.01 && amt <= 999999999.99)) throw new Error('amount out of range');
    const lines = [
      'BCD',
      '002',
      '1',                                   // UTF-8
      'SCT',
      '',                                    // BIC (optional)
      String(name).trim().slice(0, 70),
      cleanIban(iban),
      'EUR' + amt.toFixed(2),
      '',                                    // purpose
      '',                                    // structured reference
      String(reference || REFERENCE).slice(0, 140)
    ];
    return lines.join('\n');
  }

  // Returns an <svg> element (built with DOM calls, no innerHTML).
  function qrSvg(text, size) {
    qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
    const qr = qrcode(0, 'M');              // EPC requires error correction level M
    qr.addData(text, 'Byte');
    qr.make();
    const n = qr.getModuleCount();
    const quiet = 4;
    const total = n + quiet * 2;
    let d = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) d += 'M' + (c + quiet) + ' ' + (r + quiet) + 'h1v1h-1z';
      }
    }
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + total + ' ' + total);
    svg.setAttribute('width', String(size || 180));
    svg.setAttribute('height', String(size || 180));
    svg.setAttribute('shape-rendering', 'crispEdges');
    svg.setAttribute('role', 'img');
    const bg = document.createElementNS(ns, 'rect');
    bg.setAttribute('width', String(total));
    bg.setAttribute('height', String(total));
    bg.setAttribute('fill', '#ffffff');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', '#000000');
    svg.append(bg, path);
    return svg;
  }

  async function markMoved(amount) {
    const s = await chrome.storage.local.get({ moved: 0 });
    const moved = Math.round(((s.moved || 0) + (Number(amount) || 0)) * 100) / 100;
    await chrome.storage.local.set({ moved: moved });
    return moved;
  }

  return {
    REFERENCE: REFERENCE,
    cleanIban: cleanIban,
    ibanValid: ibanValid,
    formatIban: formatIban,
    maskIban: maskIban,
    ready: ready,
    epcPayload: epcPayload,
    qrSvg: qrSvg,
    markMoved: markMoved
  };
})();
