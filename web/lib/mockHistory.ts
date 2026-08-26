import { ChatHistoryItem } from "./types";

// Sample sidebar data — most visitors are unauthenticated guests, so real
// history is the exception rather than the rule. This stands in for that
// backend until conversations are actually persisted per user/session.
export const MOCK_HISTORY: ChatHistoryItem[] = [
  {
    id: "c1",
    title: "Mức phạt vượt đèn đỏ xe máy",
    preview: "Vượt đèn đỏ xe máy bị phạt bao nhiêu tiền?",
    updatedAt: "2026-08-23T08:40:00+07:00",
    mode: "citizen",
    domain: "giao_thong",
    messages: [
      {
        id: "c1-q1",
        role: "user",
        text: "Vượt đèn đỏ xe máy bị phạt bao nhiêu tiền?",
        mode: "citizen",
      },
      {
        id: "c1-a1",
        role: "assistant",
        mode: "citizen",
        text: "Người điều khiển xe máy vượt đèn đỏ có thể bị phạt tiền từ 4.000.000 đến 6.000.000 đồng.\n- Ngoài ra còn bị trừ điểm giấy phép lái xe.\n- Nếu gây tai nạn giao thông, mức phạt sẽ cao hơn và có thể bị tước quyền sử dụng giấy phép lái xe.",
      },
    ],
  },
  {
    id: "c2",
    title: "Nồng độ cồn khi lái ô tô",
    preview: "Uống một lon bia rồi lái ô tô có bị phạt không?",
    updatedAt: "2026-08-23T07:05:00+07:00",
    mode: "professional",
    domain: "giao_thong",
    messages: [
      {
        id: "c2-q1",
        role: "user",
        text: "Uống một lon bia rồi lái ô tô có bị phạt không?",
        mode: "professional",
      },
      {
        id: "c2-a1",
        role: "assistant",
        mode: "professional",
        text: "Có. Pháp luật hiện hành không quy định ngưỡng nồng độ cồn tối thiểu được phép đối với người điều khiển ô tô [1].\n- Mức phạt tăng theo nồng độ cồn đo được, thấp nhất đã bị xử phạt tiền và tước giấy phép lái xe [2].\n- Đây là một trong các hành vi bị nghiêm cấm tuyệt đối theo Luật Trật tự, an toàn giao thông đường bộ [1].",
        sources: [
          {
            chunk_id: "LUAT_TTATGTDB_36_2024_QH15_D9_K1",
            doc_id: "LUAT_TTATGTDB_36_2024_QH15",
            doc_title: "Luật Trật tự, an toàn giao thông đường bộ 2024",
            doc_type: "luat",
            article_number: 9,
            article_heading: "Các hành vi bị nghiêm cấm",
            chunk_type: "article",
            needs_review: false,
            is_amendment_context: false,
            amends_doc_id: null,
            score: 0.91,
          },
          {
            chunk_id: "ND_168_2024_D6_K6",
            doc_id: "ND_168_2024",
            doc_title: "Nghị định 168/2024/NĐ-CP",
            doc_type: "nghi_dinh",
            article_number: 6,
            article_heading: "Xử phạt vi phạm nồng độ cồn",
            chunk_type: "article",
            needs_review: false,
            is_amendment_context: false,
            amends_doc_id: null,
            score: 0.88,
          },
        ],
      },
    ],
  },
  {
    id: "c3",
    title: "Thủ tục cấp lại GPLX bị mất",
    preview: "Mất bằng lái xe máy thì làm lại ở đâu, cần giấy tờ gì?",
    updatedAt: "2026-08-22T14:20:00+07:00",
    mode: "citizen",
    domain: "giao_thong",
    messages: [
      {
        id: "c3-q1",
        role: "user",
        text: "Mất bằng lái xe máy thì làm lại ở đâu, cần giấy tờ gì?",
        mode: "citizen",
      },
      {
        id: "c3-a1",
        role: "assistant",
        mode: "citizen",
        text: "Bạn có thể nộp hồ sơ xin cấp lại tại Sở Giao thông vận tải hoặc trên Cổng dịch vụ công.\n- Cần: đơn đề nghị cấp lại, bản sao CCCD, ảnh thẻ.\n- Nếu đã quá thời hạn quy định, có thể phải sát hạch lại tùy trường hợp cụ thể.",
      },
    ],
  },
  {
    id: "c4",
    title: "Tốc độ tối đa trong khu dân cư",
    preview: "Trong khu dân cư ô tô con được chạy tối đa bao nhiêu km/h?",
    updatedAt: "2026-08-18T19:00:00+07:00",
    mode: "citizen",
    domain: "giao_thong",
    messages: [
      {
        id: "c4-q1",
        role: "user",
        text: "Trong khu dân cư ô tô con được chạy tối đa bao nhiêu km/h?",
        mode: "citizen",
      },
      {
        id: "c4-a1",
        role: "assistant",
        mode: "citizen",
        text: "Trong khu vực đông dân cư, tốc độ tối đa cho ô tô con thường là 50 hoặc 60 km/h tùy loại đường.\n- Đường đôi, đường một chiều có từ 2 làn xe cơ giới trở lên: tối đa 60 km/h.\n- Đường hai chiều, đường một chiều có 1 làn xe cơ giới: tối đa 50 km/h.",
      },
    ],
  },
  {
    id: "c5",
    title: "Sang tên xe máy qua nhiều đời chủ",
    preview: "Xe không chính chủ, đã qua 3 đời chủ thì sang tên thế nào?",
    updatedAt: "2026-08-05T10:15:00+07:00",
    mode: "professional",
    domain: "giao_thong",
    messages: [
      {
        id: "c5-q1",
        role: "user",
        text: "Xe không chính chủ, đã qua 3 đời chủ thì sang tên thế nào?",
        mode: "professional",
      },
      {
        id: "c5-a1",
        role: "assistant",
        mode: "professional",
        text: "Trường hợp xe đã chuyển nhượng qua nhiều người nhưng chưa làm thủ tục sang tên, người đang sử dụng xe có thể lập bản cam kết về nguồn gốc xe để làm thủ tục đăng ký, sang tên [1].",
        sources: [
          {
            chunk_id: "TT_73_2024_TT_BCA_D6_K3",
            doc_id: "TT_73_2024_TT_BCA",
            doc_title: "Thông tư 73/2024/TT-BCA",
            doc_type: "thong_tu",
            article_number: 6,
            article_heading: "Đăng ký xe khi chuyển nhượng qua nhiều đời chủ",
            chunk_type: "article",
            needs_review: false,
            is_amendment_context: false,
            amends_doc_id: null,
            score: 0.85,
          },
        ],
      },
    ],
  },
  {
    id: "c6",
    title: "Không đội mũ bảo hiểm",
    preview: "Đi xe máy không đội mũ bảo hiểm bị phạt bao nhiêu?",
    updatedAt: "2026-07-30T16:45:00+07:00",
    mode: "citizen",
    domain: "giao_thong",
    messages: [
      {
        id: "c6-q1",
        role: "user",
        text: "Đi xe máy không đội mũ bảo hiểm bị phạt bao nhiêu?",
        mode: "citizen",
      },
      {
        id: "c6-a1",
        role: "assistant",
        mode: "citizen",
        text: "Người điều khiển hoặc người ngồi trên xe máy không đội mũ bảo hiểm (hoặc đội nhưng không cài quai đúng cách) bị phạt tiền từ 400.000 đến 600.000 đồng.",
      },
    ],
  },
];
