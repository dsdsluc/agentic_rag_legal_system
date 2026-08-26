import { BookOpen, Scale } from "lucide-react";

const BENEFITS = [
  {
    icon: Scale,
    title: "Chế độ Chuyên gia",
    desc: "Câu trả lời kèm trích dẫn đầy đủ Luật, Nghị định, Thông tư — theo từng Điều, Khoản, Điểm cụ thể, thay vì chỉ giải thích chung chung.",
  },
  {
    icon: BookOpen,
    title: "Legal Workspace",
    desc: "Kho văn bản pháp luật giao thông, dân sự, hình sự — tra cứu trực tiếp, đối chiếu trích dẫn và theo dõi các văn bản sửa đổi, bổ sung liên quan.",
  },
];

export function AuthBenefits() {
  return (
    <div className="flex h-full flex-col justify-center gap-7 bg-primary/5 p-8 lg:p-10">
      <div className="flex items-center gap-2.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Scale size={18} />
        </span>
        <span className="font-serif text-lg font-semibold">Trợ lý Pháp luật</span>
      </div>
      <p className="font-serif text-xl leading-snug">
        Tạo tài khoản để mở khoá toàn bộ tính năng dành cho người dùng chuyên sâu.
      </p>
      <div className="flex flex-col gap-5">
        {BENEFITS.map((b) => (
          <div key={b.title} className="flex gap-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card text-primary shadow-sm">
              <b.icon size={18} />
            </span>
            <div>
              <p className="text-sm font-semibold">{b.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{b.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
