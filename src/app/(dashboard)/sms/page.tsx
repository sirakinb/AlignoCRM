import { MessagingSection } from "@/components/messaging/messaging-section";

export default function SmsPage() {
  return (
    <MessagingSection
      channel="sms"
      title="SMS"
      subtitle="Text campaigns, templates, opt-outs, and number settings."
    />
  );
}
