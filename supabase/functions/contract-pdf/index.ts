import { createClient } from 'npm:@supabase/supabase-js@2.56.0';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

interface PDFRequest {
  contract_id: string;
  action: 'generate' | 'download';
  include_signatures?: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { contract_id, action, include_signatures = true }: PDFRequest = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get auth user from header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Invalid authorization');
    }

    // Get contract with all related data
    const { data: contractData, error: contractError } = await supabase
      .from('contracts')
      .select(`
        *,
        template:contract_templates(title, category),
        creator:user_profiles!created_by(name, email, phone),
        signatories:contract_signatories(*)
      `)
      .eq('id', contract_id)
      .single();

    if (contractError) throw contractError;

    // Generate HTML for PDF
    const pdfHtml = generateContractPDF(contractData, include_signatures);

    return new Response(JSON.stringify({
      success: true,
      html: pdfHtml,
      contract_title: contractData.title,
      generated_at: new Date().toISOString()
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });

  } catch (error) {
    console.error('Error generating contract PDF:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Error generating contract PDF',
      success: false
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});

function generateContractPDF(contract: any, includeSignatures: boolean): string {
  const currentDate = new Date().toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // Process contract content with variables
  let processedContent = contract.generated_content || contract.content || '';
  
  // Replace variables if available
  if (contract.variables_data) {
    Object.entries(contract.variables_data).forEach(([key, value]: [string, any]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      processedContent = processedContent.replace(regex, value || `[${key}]`);
    });
  }

  // Sort signatories by signing order
  const sortedSignatories = (contract.signatories || []).sort((a: any, b: any) => a.signing_order - b.signing_order);

  const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${contract.title} - SIMAUD</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          line-height: 1.6;
          color: #1f2937;
          background: white;
          font-size: 14px;
        }
        
        .document-container {
          max-width: 210mm;
          margin: 0 auto;
          padding: 40px;
          background: white;
          min-height: 297mm;
          position: relative;
        }
        
        .header {
          text-align: center;
          margin-bottom: 40px;
          padding-bottom: 20px;
          border-bottom: 3px solid #3b82f6;
        }
        
        .header h1 {
          font-size: 24px;
          font-weight: 700;
          color: #1f2937;
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .header .subtitle {
          font-size: 16px;
          color: #6b7280;
          font-weight: 500;
        }
        
        .contract-info {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 30px;
        }
        
        .info-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 15px;
        }
        
        .info-item {
          display: flex;
          flex-direction: column;
        }
        
        .info-label {
          font-size: 12px;
          font-weight: 600;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 4px;
        }
        
        .info-value {
          font-size: 14px;
          color: #1f2937;
          font-weight: 500;
        }
        
        .content-section {
          margin: 30px 0;
          line-height: 1.8;
          text-align: justify;
        }
        
        .content-section h2 {
          font-size: 18px;
          font-weight: 600;
          color: #1f2937;
          margin: 25px 0 15px 0;
          border-bottom: 2px solid #e5e7eb;
          padding-bottom: 8px;
        }
        
        .content-section p {
          margin-bottom: 15px;
          text-indent: 20px;
        }
        
        .signatures-section {
          margin-top: 60px;
          page-break-inside: avoid;
        }
        
        .signatures-title {
          font-size: 20px;
          font-weight: 700;
          color: #1f2937;
          text-align: center;
          margin-bottom: 40px;
          text-transform: uppercase;
          letter-spacing: 1px;
          border-top: 2px solid #3b82f6;
          padding-top: 20px;
        }
        
        .signatures-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 40px;
          margin-top: 40px;
        }
        
        .signature-block {
          border: 2px solid #e5e7eb;
          border-radius: 12px;
          padding: 25px;
          background: #fafafa;
          text-align: center;
          min-height: 180px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        
        .signature-block.signed {
          border-color: #10b981;
          background: #f0fdf4;
        }
        
        .signature-block.pending {
          border-color: #f59e0b;
          background: #fefbf3;
          border-style: dashed;
        }
        
        .signature-area {
          height: 80px;
          border-bottom: 2px solid #6b7280;
          margin: 20px 0;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          position: relative;
        }
        
        .signature-image {
          max-height: 70px;
          max-width: 200px;
          object-fit: contain;
        }
        
        .signature-placeholder {
          position: absolute;
          bottom: 10px;
          color: #9ca3af;
          font-style: italic;
          font-size: 12px;
        }
        
        .signer-name {
          font-weight: 600;
          font-size: 16px;
          color: #1f2937;
          margin-bottom: 5px;
        }
        
        .signer-role {
          font-size: 12px;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 10px;
        }
        
        .signer-contact {
          font-size: 11px;
          color: #6b7280;
          margin-bottom: 5px;
        }
        
        .signature-date {
          font-size: 11px;
          color: #059669;
          font-weight: 500;
          margin-top: 10px;
        }
        
        .signature-status {
          font-size: 11px;
          font-weight: 600;
          padding: 4px 8px;
          border-radius: 4px;
          margin-top: 8px;
        }
        
        .signature-status.signed {
          background: #dcfce7;
          color: #166534;
        }
        
        .signature-status.pending {
          background: #fef3c7;
          color: #92400e;
        }
        
        .footer {
          margin-top: 60px;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
          text-align: center;
          color: #6b7280;
          font-size: 11px;
        }
        
        .document-id {
          position: absolute;
          top: 20px;
          right: 40px;
          font-size: 10px;
          color: #9ca3af;
          font-family: monospace;
        }
        
        .document-id-page {
          position: fixed;
          top: 20px;
          right: 40px;
          font-size: 10px;
          color: #9ca3af;
          font-family: monospace;
          z-index: 1000;
        }
        
        @media print {
          .document-container {
            margin: 0;
            padding: 20mm;
            box-shadow: none;
          }
          
          .document-id-page {
            display: block;
          }
          
          @page {
            margin: 20mm;
            @top-right {
              content: "ID: ${contract.id}";
              font-size: 10px;
              color: #9ca3af;
              font-family: monospace;
            }
          }
        }
        
        .status-badge {
          display: inline-block;
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .status-approved {
          background: #dcfce7;
          color: #166534;
        }
        
        .status-signed {
          background: #dbeafe;
          color: #1e40af;
        }
        
        .status-cancelled {
          background: #fee2e2;
          color: #dc2626;
        }
      </style>
    </head>
    <body>
      <div class="document-container">
        <div class="document-id-page">ID: ${contract.id}</div>
        
        <div class="header">
          <h1>${contract.title}</h1>
          <div class="subtitle">Documento Generado por SIMAUD</div>
          <div style="margin-top: 15px;">
            <span class="status-badge ${
              contract.approval_status === 'signed' ? 'status-signed' :
              contract.approval_status === 'approved' ? 'status-approved' :
              contract.approval_status === 'cancelled' ? 'status-cancelled' :
              'status-approved'
            }">
              ${contract.approval_status === 'signed' ? 'Documento Firmado' :
                contract.approval_status === 'approved' ? 'Documento Aprobado' :
                contract.approval_status === 'cancelled' ? 'Documento Cancelado' :
                'Documento Procesado'}
            </span>
          </div>
        </div>
        
        <div class="contract-info">
          <div class="info-grid">
            <div class="info-item">
              <div class="info-label">Cliente Principal</div>
              <div class="info-value">${contract.client_name || 'No especificado'}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Email de Contacto</div>
              <div class="info-value">${contract.client_email || 'No especificado'}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Valor del Contrato</div>
              <div class="info-value">${contract.contract_value ? '$' + contract.contract_value.toLocaleString('es-ES') : 'No especificado'}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Fecha de Vigencia</div>
              <div class="info-value">
                ${contract.start_date ? new Date(contract.start_date).toLocaleDateString('es-ES') : 'No especificada'} - 
                ${contract.end_date ? new Date(contract.end_date).toLocaleDateString('es-ES') : 'No especificada'}
              </div>
            </div>
            <div class="info-item">
              <div class="info-label">Fecha de Creación</div>
              <div class="info-value">${new Date(contract.created_at).toLocaleDateString('es-ES')}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Creado por</div>
              <div class="info-value">${contract.creator?.name || 'Sistema'}</div>
            </div>
          </div>
        </div>
        
        <div class="content-section">
          <h2>Términos y Condiciones del Contrato</h2>
          <div style="white-space: pre-wrap; font-size: 14px; line-height: 1.7;">
${processedContent}
          </div>
        </div>
        
        ${includeSignatures ? generateInlineSignaturesSection(sortedSignatories, currentDate) : ''}
        
        <div class="footer">
          <p><strong>Documento generado por SIMAUD</strong></p>
          <p>Sistema Integral de Gestión de Contratos</p>
          <p>Fecha de generación: ${currentDate} | Hora: ${new Date().toLocaleTimeString('es-ES')}</p>
          <p style="margin-top: 10px; font-size: 10px;">
            Este documento es una representación digital válida del contrato original.
            Las firmas digitales tienen plena validez legal según la normativa vigente.
          </p>
        </div>
      </div>
      
      <script>
        // Auto-print when loaded
        window.onload = function() {
          setTimeout(() => {
            window.print();
          }, 1000);
        };
      </script>
    </body>
    </html>
  `;

  return html;
}

function generateInlineSignaturesSection(signatories: any[], currentDate: string): string {
  if (!signatories || signatories.length === 0) {
    return `
      <div style="margin-top: 40px;">
        <div class="signatures-title">Sección de Firmas</div>
        <p style="text-align: center; color: #6b7280; font-style: italic;">
          No hay firmantes registrados para este contrato.
        </p>
      </div>
    `;
  }

  const signaturesHtml = signatories.map((signatory: any) => {
    const isSigned = !!signatory.signed_at;
    const signedDate = isSigned ? new Date(signatory.signed_at).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }) : null;

    return `
      <div class="signature-block ${isSigned ? 'signed' : 'pending'}">
        <div class="signer-name">${signatory.name}</div>
        <div class="signer-role">${
          signatory.role === 'client' ? 'Cliente' :
          signatory.role === 'contractor' ? 'Contratista' :
          signatory.role === 'witness' ? 'Testigo' : signatory.role
        }</div>
        <div class="signer-contact">${signatory.email}</div>
        ${signatory.phone ? `<div class="signer-contact">${signatory.phone}</div>` : ''}
        
        <div class="signature-area">
          ${isSigned && signatory.signature_url ? 
            `<img src="${signatory.signature_url}" alt="Firma de ${signatory.name}" class="signature-image" />` :
            '<div class="signature-placeholder">Firma pendiente</div>'
          }
        </div>
        
        <div class="signature-status ${isSigned ? 'signed' : 'pending'}">
          ${isSigned ? '✓ FIRMADO' : '⏳ PENDIENTE'}
        </div>
        
        ${signedDate ? `<div class="signature-date">Firmado el ${signedDate}</div>` : ''}
      </div>
    `;
  }).join('');

  const allSigned = signatories.every((s: any) => s.signed_at);
  const completionStatus = allSigned 
    ? `<p style="text-align: center; color: #059669; font-weight: 600; background: #dcfce7; padding: 12px; border-radius: 8px; margin-top: 30px;">
         ✅ CONTRATO COMPLETAMENTE FIRMADO - ${currentDate}
       </p>`
    : `<p style="text-align: center; color: #d97706; font-weight: 600; background: #fef3c7; padding: 12px; border-radius: 8px; margin-top: 30px;">
         ⏳ FIRMA EN PROCESO - ${signatories.filter((s: any) => s.signed_at).length}/${signatories.length} firmas completadas
       </p>`;

  return `
    <div style="margin-top: 60px;">
      <div class="signatures-title">Firmas del Contrato</div>
      
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 30px; margin-top: 30px;">
        ${signaturesHtml}
      </div>
      
      ${completionStatus}
      
      <div style="margin-top: 40px; padding: 20px; background: #f1f5f9; border-radius: 8px; border: 1px solid #cbd5e1;">
        <h3 style="font-size: 14px; font-weight: 600; color: #334155; margin-bottom: 10px;">
          📋 Registro de Firmas Digitales
        </h3>
        <div style="font-size: 11px; color: #64748b; line-height: 1.5;">
          ${signatories.map((s: any, index: number) => 
            `<div style="margin-bottom: 8px;">
              <strong>${index + 1}. ${s.name}</strong> (${s.role}) - 
              ${s.signed_at ? 
                `✅ Firmado el ${new Date(s.signed_at).toLocaleDateString('es-ES')} a las ${new Date(s.signed_at).toLocaleTimeString('es-ES')}` :
                '⏳ Pendiente de firma'
              }
            </div>`
          ).join('')}
        </div>
      </div>
    </div>
  `;
}