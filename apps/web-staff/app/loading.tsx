import { FullScreenTakweenLoader } from "@/components/ui/takween-loader";

export default function Loading() {
  return (
    <FullScreenTakweenLoader
      label="جاري تجهيز الصفحة..."
      sublabel="لحظات قليلة"
    />
  );
}