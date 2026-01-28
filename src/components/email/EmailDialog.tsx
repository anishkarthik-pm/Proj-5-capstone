"use client";

import React, { useState } from "react";
import { Mail, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { triggerPdfWorkflow } from "@/services/n8n/triggerWorkflow";
import type { Itinerary } from "@/types";

interface EmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itinerary: Itinerary;
}

type Status = "idle" | "sending" | "success" | "error";

export function EmailDialog({ open, onOpenChange, itinerary }: EmailDialogProps) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const isWebhookConfigured = Boolean(process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !name) return;

    setStatus("sending");
    setErrorMessage("");

    try {
      const result = await triggerPdfWorkflow({
        itinerary,
        userEmail: email,
        userName: name,
      });

      if (result.success) {
        setStatus("success");
        // Reset form after success
        setTimeout(() => {
          setEmail("");
          setName("");
          setStatus("idle");
          onOpenChange(false);
        }, 2000);
      } else {
        setStatus("error");
        setErrorMessage(result.message || "Failed to send email");
      }
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "An error occurred");
    }
  };

  const handleClose = () => {
    if (status !== "sending") {
      setStatus("idle");
      setErrorMessage("");
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Email Itinerary
          </DialogTitle>
          <DialogDescription>
            {isWebhookConfigured
              ? "Enter your details to receive a PDF of your itinerary via email."
              : "Email service is not configured. Please set NEXT_PUBLIC_N8N_WEBHOOK_URL in your environment."}
          </DialogDescription>
        </DialogHeader>

        {!isWebhookConfigured ? (
          <div className="py-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
              <p className="font-medium mb-2">n8n Webhook Not Configured</p>
              <p className="text-xs">
                To enable email functionality, add the following to your .env.local file:
              </p>
              <code className="block mt-2 p-2 bg-amber-100 rounded text-xs">
                NEXT_PUBLIC_N8N_WEBHOOK_URL=https://your-n8n-instance/webhook/xxx
              </code>
            </div>
          </div>
        ) : status === "success" ? (
          <div className="py-8 text-center">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <p className="text-lg font-medium text-green-700">Email Sent!</p>
            <p className="text-sm text-muted-foreground mt-1">
              Check your inbox for the itinerary PDF.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                Your Name
              </label>
              <Input
                id="name"
                type="text"
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={status === "sending"}
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                Email Address
              </label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={status === "sending"}
                required
              />
            </div>

            {status === "error" && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={status === "sending"}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={status === "sending" || !email || !name}>
                {status === "sending" ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Mail className="w-4 h-4 mr-2" />
                    Send Email
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default EmailDialog;
