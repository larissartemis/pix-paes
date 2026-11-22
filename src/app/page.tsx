import { AuthGate } from "@/components/AuthGate";
import { ReceiptReader } from "@/components/ReceiptReader";

export default function Home() {
  return (
    <main className="flex-1">
      <AuthGate>
        <ReceiptReader />
      </AuthGate>
    </main>
  );
}
