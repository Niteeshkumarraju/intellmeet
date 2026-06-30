import React, { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export default function TermsModal({ isOpen, onClose, initialTab = 'terms' }) {
  const [activeTab, setActiveTab] = useState(initialTab)

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-slate-900 border border-slate-800 max-h-[80vh] flex flex-col overflow-hidden text-slate-200 p-0 max-w-lg">
        {/* Header containing Tabs */}
        <DialogHeader className="p-4 border-b border-slate-800 flex flex-row items-center justify-between">
          <div className="flex gap-3">
            <Button
              variant={activeTab === 'terms' ? 'secondary' : 'ghost'}
              className={activeTab === 'terms' ? 'text-indigo-400 bg-indigo-500/10 font-semibold' : 'text-slate-400 font-medium'}
              onClick={() => setActiveTab('terms')}
            >
              📄 Terms of Service
            </Button>
            <Button
              variant={activeTab === 'privacy' ? 'secondary' : 'ghost'}
              className={activeTab === 'privacy' ? 'text-indigo-400 bg-indigo-500/10 font-semibold' : 'text-slate-400 font-medium'}
              onClick={() => setActiveTab('privacy')}
            >
              🔒 Privacy Policy
            </Button>
          </div>
        </DialogHeader>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto flex-1 leading-relaxed text-sm text-slate-400">
          {activeTab === 'terms' ? (
            <div className="space-y-4">
              <div>
                <h3 className="text-white font-bold text-base mb-1">1. Agreement to Terms</h3>
                <p>
                  By accessing or using IntellMeet, you agree to be bound by these Terms of Service. If you do not agree, please do not use the application.
                </p>
              </div>

              <div>
                <h3 className="text-white font-bold text-base mb-1">2. Use of Service</h3>
                <p>
                  You must provide accurate and complete information when registering an account. You are solely responsible for all activities that occur under your account.
                </p>
              </div>

              <div>
                <h3 className="text-white font-bold text-base mb-1">3. AI Summarization & Transcription</h3>
                <p>
                  IntellMeet utilizes advanced Artificial Intelligence (such as Google Gemini) to transcribe meetings and generate summaries. By using this service, you consent to the processing of your voice and chat logs for these purposes.
                </p>
              </div>

              <div>
                <h3 className="text-white font-bold text-base mb-1">4. User Conduct</h3>
                <p>
                  You agree not to upload any content that is illegal, defamatory, harmful, or violates intellectual property laws. Admin privileges must not be abused.
                </p>
              </div>

              <div>
                <h3 className="text-white font-bold text-base mb-1">5. Termination</h3>
                <p>
                  We reserve the right to suspend or terminate your account at any time, with or without notice, for conduct that violates these Terms or is harmful to other users.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <h3 className="text-white font-bold text-base mb-1">1. Information We Collect</h3>
                <p>
                  We collect personal information such as your name, email address, and company name when you sign up. We also temporarily process meeting chats and transcription data.
                </p>
              </div>

              <div>
                <h3 className="text-white font-bold text-base mb-1">2. How We Use Data</h3>
                <p>
                  Your email is used to manage your account and authentication. Meeting transcription data is processed by the AI summary model (Google Gemini) in real time to generate notes and action items. We do not store transcripts for training purposes.
                </p>
              </div>

              <div>
                <h3 className="text-white font-bold text-base mb-1">3. Data Retention</h3>
                <p>
                  Meeting summaries, action items, and logs are saved securely in our databases. You can delete meetings and associated summary data at any time from your dashboard.
                </p>
              </div>

              <div>
                <h3 className="text-white font-bold text-base mb-1">4. Security Measures</h3>
                <p>
                  We implement industry-standard encryption protocols to protect your audio streams, documents, and credentials from unauthorized access.
                </p>
              </div>

              <div>
                <h3 className="text-white font-bold text-base mb-1">5. Your Privacy Rights</h3>
                <p>
                  You have the right to request deletion of your account and all associated details. For any privacy queries, contact our support team.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="p-4 border-t border-slate-800 flex justify-end">
          <Button onClick={onClose} variant="default">
            I Accept / Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
