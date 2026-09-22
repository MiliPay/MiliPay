import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { Share, Alert } from 'react-native';
import { SUPPORT_EMAIL } from './brand';

export interface ReceiptInfo {
  reference: string;
  /** Total debited, in Naira. */
  amount: number;
  merchant: string;
  beneficiary: string;
  bank?: string;
  date: string;
  token?: string | null;
  units?: string | null;
  /**
   * The transaction's real status, as the server records it. Required, because
   * the previous shape made it optional and the template then ignored it: every
   * receipt this app has ever produced said "Transaction Successful", under a
   * green tick, whatever had actually happened — including for transactions
   * that failed or were refunded.
   */
  status: string;
  /**
   * Fee charged, in Naira. Omit only when it genuinely is not known; the
   * template leaves the row out rather than claiming zero. The fee row used to
   * be the hardcoded string "₦0.00 (FREE)" while the platform was charging a
   * data surcharge, a cable surcharge and an electricity convenience fee.
   */
  fee?: number;
}

/** How a status should be shown, and whether it is good news. */
function presentStatus(status: string): { label: string; tone: 'ok' | 'pending' | 'bad' } {
  const s = (status || '').toLowerCase();
  if (s === 'delivered' || s === 'success' || s === 'successful') {
    return { label: 'Successful', tone: 'ok' };
  }
  if (s === 'refunded') return { label: 'Refunded', tone: 'bad' };
  if (s === 'payment_failed' || s === 'fulfilment_failed' || s === 'failed') {
    return { label: 'Failed', tone: 'bad' };
  }
  if (s === 'refund_failed' || s === 'quarantined') {
    return { label: 'Needs attention', tone: 'bad' };
  }
  return { label: 'In progress', tone: 'pending' };
}

const STATUS_TONES = {
  ok: { bg: '#d1fae5', fg: '#065f46', mark: '#00C896', glyph: '&#10003;' },
  pending: { bg: '#fef3c7', fg: '#92400e', mark: '#f59e0b', glyph: '&#8226;' },
  bad: { bg: '#fee2e2', fg: '#991b1b', mark: '#ef4444', glyph: '&#33;' },
} as const;

export function generateReceiptHtml(receipt: ReceiptInfo): string {
  const formattedAmount = `₦${receipt.amount.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
  const state = presentStatus(receipt.status);
  const tone = STATUS_TONES[state.tone];
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MiliPay Receipt - ${receipt.reference}</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    }
    body {
      background-color: #f8fafc;
      color: #0f172a;
      padding: 30px 20px;
    }
    .receipt-card {
      max-width: 480px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 24px;
      padding: 32px 24px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.06);
      border: 1px solid #e2e8f0;
    }
    .header {
      text-align: center;
      margin-bottom: 24px;
    }
    .logo-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 56px;
      height: 56px;
      background: ${tone.mark};
      border-radius: 50%;
      color: #fff;
      font-weight: 900;
      font-size: 24px;
      margin-bottom: 12px;
    }
    .app-name {
      font-size: 20px;
      font-weight: 800;
      letter-spacing: -0.5px;
      color: #0f172a;
    }
    .status-badge {
      display: inline-block;
      margin-top: 6px;
      padding: 4px 12px;
      background: ${tone.bg};
      color: ${tone.fg};
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .amount-box {
      text-align: center;
      padding: 20px 0;
      border-top: 1px dashed #cbd5e1;
      border-bottom: 1px dashed #cbd5e1;
      margin-bottom: 24px;
    }
    .amount-label {
      font-size: 12px;
      color: #64748b;
      margin-bottom: 4px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .amount-val {
      font-size: 34px;
      font-weight: 800;
      color: #00C896;
      letter-spacing: -1px;
    }
    .details-table {
      width: 100%;
      margin-bottom: 24px;
    }
    .row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 10px 0;
      border-bottom: 1px solid #f1f5f9;
      font-size: 13px;
    }
    .row:last-child {
      border-bottom: none;
    }
    .row-label {
      color: #64748b;
      font-weight: 500;
      flex: 1;
    }
    .row-val {
      color: #0f172a;
      font-weight: 700;
      text-align: right;
      flex: 1.5;
      word-break: break-word;
    }
    .token-box {
      background: #ecfdf5;
      border: 2px dashed #00C896;
      border-radius: 16px;
      padding: 16px;
      text-align: center;
      margin-bottom: 24px;
    }
    .token-title {
      font-size: 11px;
      font-weight: 700;
      color: #065f46;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 6px;
    }
    .token-digits {
      font-size: 20px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: 1.5px;
    }
    .footer {
      text-align: center;
      border-top: 1px solid #e2e8f0;
      padding-top: 20px;
      color: #94a3b8;
      font-size: 11px;
      line-height: 1.6;
    }
    .footer strong {
      color: #475569;
    }
  </style>
</head>
<body>
  <div class="receipt-card">
    <div class="header">
      <div class="logo-badge">${tone.glyph}</div>
      <div class="app-name">MiliPay Receipt</div>
      <div class="status-badge">${state.label}</div>
    </div>

    <div class="amount-box">
      <div class="amount-label">Amount Paid</div>
      <div class="amount-val">${formattedAmount}</div>
    </div>

    ${receipt.token ? `
    <div class="token-box">
      <div class="token-title">Prepaid Electricity Token</div>
      <div class="token-digits">${receipt.token}</div>
      ${receipt.units ? `<div style="font-size: 12px; color: #64748b; margin-top: 4px;">Units Credited: ${receipt.units}</div>` : ''}
    </div>
    ` : ''}

    <div class="details-table">
      <div class="row">
        <span class="row-label">Service / Product</span>
        <span class="row-val">${receipt.merchant}</span>
      </div>
      <div class="row">
        <span class="row-label">Beneficiary</span>
        <span class="row-val">${receipt.beneficiary}</span>
      </div>
      <div class="row">
        <span class="row-label">Payment Method</span>
        <span class="row-val">${receipt.bank || 'MiliPay DirectPay'}</span>
      </div>
      ${
        receipt.fee === undefined
          ? ''
          : `<div class="row">
        <span class="row-label">Fee</span>
        <span class="row-val"${receipt.fee === 0 ? ' style="color: #00C896;"' : ''}>${
          receipt.fee === 0
            ? 'No fee'
            : `₦${receipt.fee.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`
        }</span>
      </div>`
      }
      <div class="row">
        <span class="row-label">Date & Time</span>
        <span class="row-val">${receipt.date}</span>
      </div>
      <div class="row">
        <span class="row-label">Transaction Reference</span>
        <span class="row-val">${receipt.reference}</span>
      </div>

    </div>

    <div class="footer">
      <strong>MiliPay Technologies Limited</strong><br>
      Keep this receipt. Quote the reference above if you contact support.<br>
      ${SUPPORT_EMAIL}
    </div>
  </div>
</body>
</html>
`;
}

export async function shareReceiptAsPdf(receipt: ReceiptInfo): Promise<void> {
  try {
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      Alert.alert('Sharing Unavailable', 'Sharing is not supported on this device.');
      return;
    }

    const html = generateReceiptHtml(receipt);
    const { uri } = await Print.printToFileAsync({
      html,
      base64: false,
    });

    await Sharing.shareAsync(uri, {
      UTI: '.pdf',
      mimeType: 'application/pdf',
      dialogTitle: `MiliPay Receipt - ${receipt.reference}`,
    });
  } catch (err: any) {
    console.error('Error sharing receipt as PDF:', err);
    Alert.alert('Share Error', err.message || 'Unable to generate receipt PDF');
  }
}

export async function shareReceiptAsImage(viewRef: React.RefObject<any>): Promise<void> {
  try {
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      Alert.alert('Sharing Unavailable', 'Sharing is not supported on this device.');
      return;
    }

    if (!viewRef.current) {
      Alert.alert('Capture Error', 'Receipt card is not ready for image capture.');
      return;
    }

    const uri = await captureRef(viewRef, {
      format: 'png',
      quality: 1.0,
      result: 'tmpfile',
    });

    await Sharing.shareAsync(uri, {
      mimeType: 'image/png',
      dialogTitle: 'Share Transaction Receipt',
    });
  } catch (err: any) {
    console.error('Error sharing receipt as image:', err);
    Alert.alert('Share Error', err.message || 'Unable to capture receipt image');
  }
}

export async function shareReceiptAsText(receipt: ReceiptInfo): Promise<void> {
  try {
    const text = `*MiliPay Transaction Receipt*
Status: Successful
Amount: ₦${receipt.amount.toLocaleString()}
Service: ${receipt.merchant}
Beneficiary: ${receipt.beneficiary}
Date: ${receipt.date}
Ref: ${receipt.reference}
${receipt.token ? `Token: ${receipt.token}\n` : ''}Payment: ${receipt.bank || 'MiliPay Account'}`;

    await Share.share({
      message: text,
      title: `MiliPay Receipt - ${receipt.reference}`,
    });
  } catch (err: any) {
    console.error('Error sharing receipt as text:', err);
  }
}
