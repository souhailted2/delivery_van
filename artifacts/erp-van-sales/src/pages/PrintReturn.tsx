import { useEffect } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getGetReturnQueryOptions, getGetCompanySettingsQueryOptions } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";

function formatDZD(amount: number) {
  return amount.toLocaleString("ar-DZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " دج";
}

function typeLabel(t: string) {
  return t === "client_return" ? "مرتجع من عميل" : "مرتجع من شاحنة";
}

export default function PrintReturn() {
  const { user, isLoading: authLoading } = useAuth();
  const { id } = useParams<{ id: string }>();
  const returnId = Number(id);

  const validId = !isNaN(returnId) && returnId > 0 && !!user;
  const { data: ret, isLoading } = useQuery({
    ...getGetReturnQueryOptions(validId ? returnId : 0),
    enabled: validId,
  });

  const { data: companySettings, isLoading: settingsLoading } = useQuery({
    ...getGetCompanySettingsQueryOptions(),
    enabled: !!user,
  });

  const storeName = companySettings?.storeName || "VanSales ERP";
  const storePhone = companySettings?.phone || "";
  const storeAddress = companySettings?.address || "";

  const createdAt = ret?.createdAt ? new Date(ret.createdAt) : null;
  const dateStr = createdAt?.toLocaleDateString("ar-DZ", { year: "numeric", month: "2-digit", day: "2-digit" }) ?? "";
  const timeStr = createdAt?.toLocaleTimeString("ar-DZ", { hour: "2-digit", minute: "2-digit" }) ?? "";
  const totalUnits = ret?.items.reduce((s, i) => s + i.quantity, 0) ?? 0;

  useEffect(() => {
    if (!ret || settingsLoading) return;
    document.title = `مرتجع #${ret.id} — ${storeName}`;
    const timer = setTimeout(() => window.print(), 500);
    return () => clearTimeout(timer);
  }, [ret, settingsLoading, storeName]);

  useEffect(() => {
    const handler = () => window.close();
    window.addEventListener("afterprint", handler);
    return () => window.removeEventListener("afterprint", handler);
  }, []);

  if (authLoading || isLoading || settingsLoading) return <div className="print-loading"><p>جارٍ تحميل المرتجع...</p></div>;
  if (!user) return <div className="print-loading"><p>يجب تسجيل الدخول أولاً</p></div>;
  if (!ret) return <div className="print-loading"><p>لم يتم العثور على المرتجع</p></div>;

  return (
    <div className="receipt" dir="rtl">

      <div className="receipt-header">
        <div className="store-name">{storeName}</div>
        {storePhone && <div className="store-phone">{storePhone}</div>}
        {storeAddress && <div className="store-address">{storeAddress}</div>}
        <div className="return-badge">إيصال مرتجع</div>
      </div>

      <hr className="receipt-hr thick" />

      <table className="meta-table">
        <tbody>
          <tr>
            <td className="label">رقم المرتجع</td>
            <td className="value strong">#{ret.id}</td>
          </tr>
          <tr>
            <td className="label">التاريخ</td>
            <td className="value">{dateStr}</td>
          </tr>
          <tr>
            <td className="label">الوقت</td>
            <td className="value">{timeStr}</td>
          </tr>
          <tr>
            <td className="label">النوع</td>
            <td className="value">{typeLabel(ret.type)}</td>
          </tr>
          <tr>
            <td className="label">العميل</td>
            <td className="value">{ret.clientName || "-"}</td>
          </tr>
          <tr>
            <td className="label">البائع</td>
            <td className="value">{ret.truckName || "-"}</td>
          </tr>
        </tbody>
      </table>

      <hr className="receipt-hr dashed" />

      <table className="items-table">
        <thead>
          <tr>
            <th className="col-name">المنتج</th>
            <th className="col-qty">كمية</th>
            <th className="col-price">سعر</th>
            <th className="col-total">مجموع</th>
          </tr>
        </thead>
        <tbody>
          {ret.items.map((item, idx) => (
            <tr key={idx} className={idx % 2 === 0 ? "row-even" : "row-odd"}>
              <td className="col-name-cell">{item.productName ?? "منتج محذوف"}</td>
              <td className="col-num-cell">{item.quantity}</td>
              <td className="col-num-cell">{item.unitPrice.toFixed(0)}</td>
              <td className="col-num-cell col-subtotal">{item.subtotal.toFixed(0)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="total-section return-total">
        <span className="total-label">إجمالي المرتجع</span>
        <span className="total-amount">{formatDZD(ret.totalAmount)}</span>
      </div>

      <hr className="receipt-hr dashed" />

      <div className="receipt-summary">
        <span>{ret.items.length} صنف</span>
        <span>{totalUnits} وحدة مُرجعة</span>
      </div>

      <div className="receipt-footer">
        <div>شكراً لتعاملكم معنا</div>
      </div>

      <button className="no-print" onClick={() => window.print()}>
        طباعة
      </button>
    </div>
  );
}
