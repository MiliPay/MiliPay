import React, { useState } from "react";
import { Modal } from "@biopay/shared/components/ui/Modal";
import { Input } from "@biopay/shared/components/ui/Input";
import { Button } from "@biopay/shared/components/ui/Button";
import { createStaffMember } from "@biopay/shared/features/staff/api";
import type { Role } from "@biopay/shared/types";

interface CreateStaffModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateStaffModal({ isOpen, onClose, onSuccess }: CreateStaffModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
    role: "agent" as Role,
    state: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // In production, this would call a Supabase Edge Function which securely
      // uses supabase.auth.admin.createUser to register the user with the given role.
      await createStaffMember(formData);
      onSuccess();
      onClose();
      // Reset form
      setFormData({ fullName: "", email: "", phone: "", role: "agent", state: "" });
    } catch (err: any) {
      setError(err.message || "Failed to create staff member");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Register New Staff">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-status-fail/10 border border-status-fail/30 rounded-lg text-sm text-status-fail">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <Input 
            label="Full Name" 
            name="fullName"
            placeholder="e.g. Adewale Okafor"
            value={formData.fullName}
            onChange={handleChange}
            required 
          />
          <div className="grid grid-cols-2 gap-4">
            <Input 
              label="Email Address" 
              name="email"
              type="email"
              placeholder="name@biopay.ng"
              value={formData.email}
              onChange={handleChange}
              required 
            />
            <Input 
              label="Phone Number" 
              name="phone"
              placeholder="080..."
              value={formData.phone}
              onChange={handleChange}
              required 
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-ink-muted uppercase tracking-wide">
              Role
            </label>
            <select
              name="role"
              value={formData.role}
              onChange={handleChange}
              className="w-full bg-ledger-line border border-white/[0.05] rounded-lg px-4 py-2.5 text-ink focus:outline-none focus:border-signal/50 focus:ring-1 focus:ring-signal/50 transition-colors appearance-none"
              required
            >
              <option value="agent">Field Agent</option>
              <option value="support">Service & Support Staff</option>
              <option value="admin">Administrator</option>
            </select>
          </div>

          {formData.role === "agent" && (
            <Input 
              label="Assigned State" 
              name="state"
              placeholder="e.g. Lagos"
              value={formData.state}
              onChange={handleChange}
              required 
            />
          )}

          <div className="p-4 bg-signal/5 border border-signal/20 rounded-lg">
            <p className="text-sm text-signal-bright font-medium mb-1">Temporary Password</p>
            <p className="text-xs text-ink-muted">
              The user will be created with the temporary password <code className="font-mono bg-ledger px-1 py-0.5 rounded text-white">BioPay123!</code>. 
              They will be required to change it upon their first login.
            </p>
          </div>
        </div>

        <div className="pt-4 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={isSubmitting}>
            Create Staff
          </Button>
        </div>
      </form>
    </Modal>
  );
}
