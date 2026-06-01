import html2canvas from "html2canvas";
import jsPDF from "jspdf";

export async function downloadCertificateAsPdf(node: HTMLElement, verificationId: string) {
  const canvas = await html2canvas(node, { backgroundColor: null, scale: 2, useCORS: true });
  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: [canvas.width, canvas.height] });
  pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
  pdf.save(`vardebevis-${verificationId}.pdf`);
}

export async function downloadCertificateAsPng(node: HTMLElement, verificationId: string) {
  const canvas = await html2canvas(node, { backgroundColor: null, scale: 2, useCORS: true });
  const url = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = url;
  a.download = `vardebevis-${verificationId}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
