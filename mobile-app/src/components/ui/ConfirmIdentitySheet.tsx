import React from 'react';
import { BottomSheet } from '../ds/BottomSheet';
import { AuthContent } from '../purchase/AuthSheet';

interface Props {
  visible: boolean;
  /** Shown under "Confirm it's you" and in the phone's fingerprint prompt. */
  reason: string;
  /**
   * Skip the fingerprint and demand the PIN.
   *
   * Above the customer's PIN threshold the server requires the PIN itself —
   * a fingerprint is checked by the phone, which the server cannot verify, so
   * biometrics alone cannot authorise a large payment. Below the threshold the
   * fingerprint is enough and this stays false.
   */
  requirePin?: boolean;
  /**
   * Carries the PIN when one was entered, so the caller can pass it to a
   * server call that needs to check it again. Undefined after a biometric.
   */
  onConfirmed: (pin?: string) => void;
  onCancel: () => void;
}

/**
 * Confirms the customer before a sensitive action — linking a bank, changing
 * the PIN, turning on quick pay: fingerprint (or Face ID) first, the MiliPay
 * PIN as the fallback. The design's "Confirm it's you" sheet (the
 * prototype's `linkAuth`), drawn by the same step the purchase flow uses.
 *
 * The PIN is checked server-side by verify_own_pin, which shares the payment
 * path's failed-attempt counter and 15-minute lockout — so this is not a softer
 * door into the same account.
 */
export function ConfirmIdentitySheet({ visible, reason, requirePin = false, onConfirmed, onCancel }: Props) {
  return (
    <BottomSheet visible={visible} onClose={onCancel}>
      <AuthContent
        active={visible}
        subtitle={reason}
        reason={reason}
        pinRequired={requirePin}
        onApproved={onConfirmed}
        onCancel={onCancel}
      />
    </BottomSheet>
  );
}
