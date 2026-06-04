export const koreanLongMarkdownFixture = [
  "# 한국어 렌더 회귀",
  "",
  "한글 입력과 긴 문단이 렌더 중간 계층을 지나도 손상되지 않아야 합니다.",
  "수식 $E=mc^2$, 표, Mermaid, 긴 본문이 같은 렌더 작업 안에서 함께 처리되는 케이스입니다.",
  "",
  "```mermaid",
  "graph TD",
  "  A[초안] --> B[검토]",
  "  B --> C[내보내기]",
  "```",
  "",
  "| 항목 | 값 |",
  "| --- | --- |",
  "| IME | 정상 |",
  "| 긴 문서 | 안정 |",
  "",
  "본문 ".repeat(80),
].join("\n");

export const koreanLongHtmlFixture = [
  "<h1>한국어 렌더 회귀</h1>",
  "<p>한글 입력과 긴 문단이 렌더 중간 계층을 지나도 손상되지 않아야 합니다.</p>",
  '<div data-type="mermaid" code="graph TD&#10;A--&gt;B"></div>',
  '<span data-type="mathInline" data-latex="E=mc^2">E=mc^2</span>',
].join("\n");
