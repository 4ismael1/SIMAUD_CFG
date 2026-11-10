export function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );
}
export function renderLayout(title: string, greeting: string, message: string, link: string) {
  return `<!doctype html>
<html lang="es">
<body style="margin:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#242424">
<table role="presentation" width="100%"><tr><td align="center">
  <table role="presentation" width="600" style="width:100%;max-width:600px;background:#ffffff">
  <tr><td style="padding:32px">
    <h1 style="color:#8B2029;font-size:24px">${escapeHtml(title)}</h1>
    <p>${escapeHtml(greeting)}</p>
    <p style="white-space:pre-line">${escapeHtml(message)}</p>
    <p><a style="color:#8B2029" href="${escapeHtml(link)}">Abrir SIMAUD</a></p>
    <p style="font-size:12px;color:#666">Si no esperabas este correo, contacta con la administración.</p>
  </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}
