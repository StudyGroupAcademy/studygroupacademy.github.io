# StudyGroup Academy learning upgrade

This update adds a browser-side learning layer without introducing new package dependencies or changing the existing authentication/database architecture.

## Included

- Per-subject exam-board selector on subject notes and worksheet pages.
- The selector reads the signed-in student's saved `boards` profile field, saves changes back to that field, and uses local storage when the student is signed out.
- GCSE Mathematics board references and official specification links for AQA 8300, Pearson Edexcel 1MA1, OCR J560, WJEC Eduqas C300, WJEC Wales and CCEA.
- A GCSE Maths topic map covering Number, Algebra, Ratio/proportion/rates of change, Geometry/measures, Probability and Statistics. This is a topic-organising map, not a claim that every board has identical assessment structures.
- Interactive flashcards on lesson pages, with reveal, previous/next, shuffle and self-rating controls.
- A procedural GCSE Maths worksheet generator. It generates new values and question instances for linear equations, percentage change, gradient, expanding brackets, collecting like terms, ratio sharing and fraction addition. Each generated question has a linked answer, hint and worked solution.
- Foundation/Higher selector and adjustable worksheet length.
- More tolerant answer checking for numeric equivalents, fractions, currency formatting and algebraically equivalent linear expressions in generated questions.
- Improved numeric equivalence checking for the existing worksheets.
- Accessible inline SVG learning diagrams for selected Maths, Biology, Chemistry, Physics and History lessons.
- Responsive styling for the new learning components.

## Important curriculum/content limitations

- The new board selector is available for every subject, but detailed board-by-board specification mapping is currently implemented only for GCSE Mathematics. For other subjects, the selected board is saved and shown, but the exact subject specification still needs to be mapped before claiming board-specific coverage.
- The current lesson catalogue remains the original StudyGroup content plus the new interactive layer. This is not yet a complete set of deep lessons, worksheets and flashcard decks for every topic in every exam-board specification.
- The Maths question generator is procedural and template-based. It creates fresh values and contexts from checked question structures; it is not an unrestricted AI model. It runs locally in the browser and does not need an API key.
- The marking system checks final answers and accepts selected equivalent forms. It does not yet award genuine step-by-step method marks from arbitrary student working. Worked solutions and mark guidance are shown to help students compare their method.
- Generated questions are original practice questions, not official past-paper questions. Students should use the official specification linked in the page to confirm exact tier coverage.

## Official GCSE Mathematics references consulted

- AQA GCSE Mathematics 8300 subject content: https://www.aqa.org.uk/subjects/mathematics/gcse/mathematics-8300/specification/subject-content
- Pearson Edexcel GCSE Mathematics: https://qualifications.pearson.com/en/qualifications/edexcel-gcses/mathematics-2015.html
- OCR GCSE Mathematics J560: https://www.ocr.org.uk/qualifications/gcse/mathematics-j560-from-2015/specification-at-a-glance/
- WJEC Eduqas GCSE Mathematics C300: https://www.eduqas.co.uk/qualifications/mathematics-gcse/
- WJEC Mathematics: https://www.wjec.co.uk/qualifications/mathematics-gcse/
- CCEA GCSE Mathematics: https://ccea.org.uk/downloads/docs/Specifications/GCSE/GCSE%20Mathematics%20%282017%29/GCSE%20Mathematics%20%282017%29-specification-Standard.pdf
- Department for Education GCSE Mathematics subject content: https://www.gov.uk/government/publications/gcse-mathematics-subject-content-and-assessment-objectives

## Validation

- `npm run build` passes.
- The existing test suite has one failing Firebase-auth source assertion. The same test fails against the unmodified uploaded archive, so it is pre-existing and not caused by this upgrade. The other 19 tests pass.
