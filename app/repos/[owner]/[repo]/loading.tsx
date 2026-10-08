import { LoadingStatus } from "@/features/state-views/components/loading-status";

export default function Loading() {
  return (
    <main className="flex flex-1 flex-col items-center gap-6 p-8">
      <LoadingStatus />
    </main>
  );
}
