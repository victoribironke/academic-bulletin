import qrcode from "qrcode-generator";

/**
 * A QR code for `text` as an SVG data URL: black squares on white with a
 * four-module quiet zone, so phone cameras read it in light or dark mode.
 */
export function qrCodeDataUrl(text: string): string {
  const qr = qrcode(0, "M");
  qr.addData(text, "Byte");
  qr.make();

  const count = qr.getModuleCount();
  const quiet = 4;
  const size = count + quiet * 2;
  let path = "";
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) path += `M${col + quiet} ${row + quiet}h1v1h-1z`;
    }
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">` +
    `<rect width="${size}" height="${size}" fill="#fff"/>` +
    `<path d="${path}" fill="#000"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
