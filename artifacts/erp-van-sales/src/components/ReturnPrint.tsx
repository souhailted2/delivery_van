import { useState } from "react";
import { useGetReturn, useGetCompanySettings } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, X, Loader2, Bluetooth } from "lucide-react";
import { printReturnText } from "@/lib/rawbt";

interface Props {
  returnId: number | null;
  onClose: () => void;
}

function formatDZD(amount: number) {
  return amount.toLocaleString("ar-DZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " دج";
}

function typeLabel(t: string) {
  return t === "client_return" ? "مرتجع من عميل" : "مرتجع من شاحنة";
}

function ReturnPrintContent({ returnId, onClose }: { returnId: number; onClose: () => void }) {
  const [capturing, setCapturing] = useState(false);
  const { data: ret, isLoading } = useGetReturn(returnId);
  const { data: companySettings } = useGetCompanySettings();

  const storeName = companySettings?.storeName || "VanSales ERP";
  const storePhone = companySettings?.phone || "";
  const storeAddress = companySettings?.address || "";

  const createdAt = ret?.createdAt ? new Date(ret.createdAt) : null;
  const dateStr = createdAt?.toLocaleDateString("ar-DZ", { year: "numeric", month: "2-digit", day: "2-digit" }) ?? "";
  const timeStr = createdAt?.toLocaleTimeString("ar-DZ", { hour: "2-digit", minute: "2-digit" }) ?? "";

  const handleBrowserPrint = () => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    const url = `${base}/print/return/${returnId}`;
    const w = window.open(url, "_blank", "width=380,height=750,scrollbars=yes");
    if (!w) alert("يرجى السماح بالنوافذ المنبثقة لهذا الموقع لتتمكن من الطباعة");
  };

  const handleImagePrint = async () => {
    if (!ret) return;
    setCapturing(true);
    try {
      await printReturnText(ret);
    } catch (e) {
      alert("فشلت الطباعة: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setCapturing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="mr-3 text-muted-foreground">جارٍ تحميل المرتجع...</span>
      </div>
    );
  }

  if (!ret) {
    return <div className="text-center py-8 text-muted-foreground">لم يتم العثور على المرتجع</div>;
  }

  return (
    <>
      <div
        className="rounded-lg border border-dashed border-red-300 bg-white text-black text-[11px] leading-snug overflow-hidden"
        dir="rtl"
        style={{ fontFamily: "Tahoma, Arial, sans-serif" }}
      >
        <div className="text-center py-3 px-2 border-b-2 border-black">
          <div className="font-black text-[16px] tracking-wide">{storeName}</div>
          {storePhone && <div className="text-[9px] text-gray-600 mt-0.5">{storePhone}</div>}
          {storeAddress && <div className="text-[9px] text-gray-500 mt-0.5">{storeAddress}</div>}
          <div className="mt-1.5">
            <span className="inline-block bg-red-100 text-red-800 border border-red-400 rounded px-2 py-0.5 text-[9px] font-bold tracking-wider">
              ◄ إيصال مرتجع ►
            </span>
          </div>
        </div>

        <div className="px-2 py-2">
          <div className="grid grid-cols-2 gap-x-1 text-[10px] mb-2">
            {[
              ["رقم المرتجع", <strong key="id">#{ret.id}</strong>],
              ["التاريخ", dateStr],
              ["الوقت", timeStr],
              ["النوع", typeLabel(ret.type)],
              ["العميل", ret.clientName || "-"],
              ["البائع", ret.truckName || "-"],
            ].map(([label, val], i) => (
              <div key={i} className="contents">
                <span className="font-bold text-gray-700 py-0.5">{label}</span>
                <span className="py-0.5">{val}</span>
              </div>
            ))}
          </div>
        </div>

        <table className="w-full text-[10px] border-collapse">
          <thead>
            <tr style={{ borderTop: "1.5px solid #000", borderBottom: "1.5px solid #000" }}>
              <th className="text-right py-1 px-2 font-bold">المنتج</th>
              <th className="text-center py-1 font-bold">كمية</th>
              <th className="text-center py-1 font-bold">سعر</th>
              <th className="text-center py-1 px-2 font-bold">مجموع</th>
            </tr>
          </thead>
          <tbody>
            {ret.items.map((item, idx) => (
              <tr key={idx} style={{ background: idx % 2 === 0 ? "#fff" : "#fef2f2" }}>
                <td className="py-1 px-2 text-[10px]" style={{ maxWidth: "28mm", wordBreak: "break-word" }}>
                  {item.productName ?? "منتج محذوف"}
                </td>
                <td className="text-center py-1 text-[10px]">{item.quantity}</td>
                <td className="text-center py-1 text-[10px]">{item.unitPrice.toFixed(0)}</td>
                <td className="text-center py-1 px-2 text-[10px] font-semibold">{item.subtotal.toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-between items-center px-2 py-2 font-black text-[14px]" style={{ borderTop: "2px solid #000" }}>
          <span>{formatDZD(ret.totalAmount)}</span>
          <span>إجمالي المرتجع</span>
        </div>

        <div className="text-center py-2 border-t border-dashed border-gray-300">
          <div className="text-[10px] text-gray-600 mb-0.5">
            {ret.items.length} صنف — {ret.items.reduce((s, i) => s + i.quantity, 0)} وحدة مُرجعة
          </div>
          <div className="font-bold text-[11px]">شكراً لتعاملكم معنا</div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Button
          className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white font-bold text-base h-11"
          onClick={handleImagePrint}
          disabled={capturing}
        >
          {capturing
            ? <><Loader2 className="h-5 w-5 animate-spin" /> جارٍ التحضير...</>
            : <><Bluetooth className="h-5 w-5" /> طباعة عبر RawBT</>
          }
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 gap-2 h-9" onClick={handleBrowserPrint}>
            <Printer className="h-4 w-4" />
            طباعة عادية
          </Button>
          <Button variant="outline" onClick={onClose} className="gap-2 h-9">
            <X className="h-4 w-4" />
            إغلاق
          </Button>
        </div>
      </div>
    </>
  );
}

export function ReturnPrint({ returnId, onClose }: Props) {
  return (
    <Dialog open={!!returnId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Printer className="h-4 w-4 text-destructive" />
            معاينة إيصال المرتجع
          </DialogTitle>
        </DialogHeader>
        {returnId !== null && (
          <ReturnPrintContent returnId={returnId} onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}
