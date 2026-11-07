export const courses = [
  {
    slug: "maths", title: "Mathematics", lessonCourse: "Maths", group: "maths", icon: "∑", tone: "course-lilac",
    description: "Build confidence in number, algebra and graphs.",
    notes: [
      { title: "Solving linear equations", summary: "Keep an equation balanced by doing the same operation to both sides.", points: ["Expand brackets before collecting like terms.", "Undo addition or subtraction before multiplication or division.", "Substitute your answer back into the original equation."], example: "3(x − 2) + 5 = 20 → 3x − 1 = 20 → 3x = 21 → x = 7." },
      { title: "Percentage change", summary: "Compare the amount of change with the original value.", points: ["Change = new value − original value.", "Percentage change = change ÷ original value × 100.", "Use the original value as the denominator."], example: "A price rises from £40 to £46: £6 ÷ £40 × 100 = 15% increase." },
      { title: "Understand gradient", summary: "Gradient measures how steep a straight line is: vertical change divided by horizontal change.", points: ["Choose two clear points on the line.", "Find the change in y (the rise).", "Find the change in x (the run).", "Gradient = change in y ÷ change in x; keep the signs."], example: "Through (2, 3) and (6, 11): change in y = 8, change in x = 4, so gradient = 8 ÷ 4 = 2." }
    ],
    worksheets: [
      { title: "Equations and percentages", questions: [
        { prompt: "Solve 5x − 7 = 18.", answer: "x = 5", working: ["Add 7 to both sides: 5x = 25.", "Divide both sides by 5."] },
        { prompt: "A jacket falls in price from £80 to £60. Find the percentage decrease.", answer: "25%", working: ["Decrease = £20.", "£20 ÷ £80 × 100 = 25%."] },
        { prompt: "Solve 2(x + 4) = 18.", answer: "x = 5", working: ["Divide by 2: x + 4 = 9.", "Subtract 4."] }
      ] }
    ]
  },
  {
    slug: "biology", title: "Biology", lessonCourse: "Biology", group: "science", icon: "◉", tone: "course-green",
    description: "Explore cells, living systems and their processes.",
    notes: [
      { title: "Moving substances in and out of cells", summary: "Cells exchange substances across their membranes using different transport processes.", points: ["Diffusion is the net movement of particles from high to low concentration.", "Osmosis is the net movement of water through a partially permeable membrane.", "Active transport moves particles against a concentration gradient and needs energy."], example: "Oxygen moving from the lungs, where its concentration is higher, into the blood is diffusion." }
    ],
    worksheets: [
      { title: "Cell transport", questions: [
        { prompt: "Which process moves particles from high to low concentration?", answer: "Diffusion.", working: ["Particles move down their concentration gradient."] },
        { prompt: "What does osmosis move through a partially permeable membrane?", answer: "Water molecules.", working: ["Osmosis is specifically the net movement of water."] },
        { prompt: "Why does active transport require energy?", answer: "It moves particles against their concentration gradient.", working: ["Energy is needed to move particles from lower to higher concentration."] }
      ] }
    ]
  },
  {
    slug: "chemistry", title: "Chemistry", lessonCourse: "Chemistry", group: "science", icon: "⚛", tone: "course-blue",
    description: "Connect atoms, reactions and materials to the world around you.",
    notes: [
      { title: "Atoms, ions and charge", summary: "An atom becomes an ion when it gains or loses electrons.", points: ["Protons have charge +1; electrons have charge −1; neutrons have no charge.", "A neutral atom has equal numbers of protons and electrons.", "Losing electrons makes a positive ion; gaining electrons makes a negative ion."], example: "A magnesium atom loses two electrons to form Mg²⁺." }
    ],
    worksheets: [
      { title: "Atomic structure", questions: [
        { prompt: "A chlorine atom gains one electron. What is the ion's charge?", answer: "1−", working: ["The extra electron adds one negative charge."] },
        { prompt: "An atom has 11 protons and 10 electrons. What is its overall charge?", answer: "1+", working: ["There is one more proton than electron."] },
        { prompt: "How many electrons does a neutral atom with 8 protons have?", answer: "8 electrons.", working: ["A neutral atom has equal numbers of protons and electrons."] }
      ] }
    ]
  },
  {
    slug: "physics", title: "Physics", lessonCourse: "Physics", group: "science", icon: "ϟ", tone: "course-coral",
    description: "Use clear models to explain forces, energy and electricity.",
    notes: [
      { title: "Current and resistance in a series circuit", summary: "A series circuit has a single path for charge to flow around.", points: ["Current is the same at every point in a series circuit.", "Add component resistances to find total series resistance.", "Use potential difference = current × resistance (V = IR)."], example: "A 9 V supply across a 3 Ω resistor gives I = V ÷ R = 3 A." }
    ],
    worksheets: [
      { title: "Electric circuits", questions: [
        { prompt: "A 12 V supply is connected across a 4 Ω resistor. Find the current.", answer: "3 A", working: ["I = V ÷ R = 12 ÷ 4."] },
        { prompt: "Two resistors of 2 Ω and 5 Ω are in series. Find their total resistance.", answer: "7 Ω", working: ["Add series resistances: 2 + 5 = 7 Ω."] },
        { prompt: "What is the current at different points in one series loop?", answer: "It is the same at every point.", working: ["There is only one path for charge to flow."] }
      ] }
    ]
  },
  {
    slug: "english", title: "English", lessonCourse: "English", group: "english", icon: "Aa", tone: "course-yellow",
    description: "Develop precise, well-supported reading and writing.",
    notes: [
      { title: "Build an analysis paragraph", summary: "Explain how a writer's specific choice shapes meaning and a reader's response.", points: ["Make one clear point about an idea, character or mood.", "Choose a short quotation that supports the point.", "Zoom in on a word and explain its associations.", "Connect the effect to the reader or the wider moment."], example: "“The wind clawed at the door.” The verb “clawed” suggests an animal attack, making the setting feel threatening." }
    ],
    worksheets: [
      { title: "Writer's methods", questions: [
        { prompt: "In “The wind clawed at the door”, what does “clawed” suggest?", answer: "It suggests a hostile animal attack, making the setting feel threatening.", working: ["Identify the verb's associations.", "Link those associations to the mood created."] },
        { prompt: "Why is a short quotation often useful in analysis?", answer: "It keeps the point focused on precise words or methods.", working: ["A focused quotation makes it easier to analyse a specific choice."] },
        { prompt: "What should follow a point and quotation in an analysis paragraph?", answer: "An explanation of the writer's method and its effect.", working: ["Explain how the evidence supports the point and shapes meaning."] }
      ] }
    ]
  },
  {
    slug: "history", title: "History", lessonCourse: "History", group: "humanities", icon: "◷", tone: "course-peach",
    description: "Use evidence to explain causes, change and consequence.",
    notes: [
      { title: "Explain a chain of cause and consequence", summary: "A strong explanation shows how one factor led to a change, rather than listing events.", points: ["Name a precise cause in its historical context.", "Explain how it affected people's choices or circumstances.", "Show why the next link in the chain mattered.", "Support the explanation with relevant evidence."], example: "A poor harvest can reduce food supplies; scarcity can raise prices; hardship can then fuel protest." }
    ],
    worksheets: [
      { title: "Causation and evidence", questions: [
        { prompt: "Which is the clearer causal explanation: “Prices rose and people protested” or “Rising food prices left families unable to afford bread, helping fuel protests”?", answer: "The second explanation.", working: ["It connects the price rise to hardship and then to protest."] },
        { prompt: "What should a historical claim be supported with?", answer: "Accurate, relevant evidence.", working: ["Evidence helps show why the claim is convincing."] },
        { prompt: "Why is it useful to place a cause in its historical context?", answer: "Context clarifies the circumstances and why the cause mattered.", working: ["A factor's effects depend on the situation at the time."] }
      ] }
    ]
  },
  {
    slug: "french", title: "French", lessonCourse: "French", group: "languages", icon: "é", tone: "course-rose",
    description: "Practise useful vocabulary and grammar in small steps.",
    notes: [
      { title: "Regular present-tense −er verbs", summary: "For many French verbs, remove −er and add the ending that matches the subject.", points: ["The endings are −e, −es, −e, −ons, −ez, −ent.", "Match them to je, tu, il/elle, nous, vous, ils/elles.", "The written −ent ending is silent in speech."], example: "parler → nous parlons (we speak); ils parlent (they speak)." }
    ],
    worksheets: [
      { title: "Present-tense verbs", questions: [
        { prompt: "Complete: vous ______ (parler).", answer: "vous parlez", working: ["The ending for vous is −ez."] },
        { prompt: "Complete: nous ______ (aimer).", answer: "nous aimons", working: ["Remove −er to find aim−, then add −ons."] },
        { prompt: "What is the ending for ils/elles with a regular −er verb?", answer: "−ent (silent in speech).", working: ["The written endings are −e, −es, −e, −ons, −ez, −ent."] }
      ] }
    ]
  },
  {
    slug: "spanish", title: "Spanish", lessonCourse: "Spanish", group: "languages", icon: "ñ", tone: "course-coral",
    description: "Build confidence with everyday Spanish vocabulary and grammar.",
    notes: [
      { title: "Using estar for temporary states and location", summary: "Estar is commonly used for location and states that can change.", points: ["Estoy means I am; estás means you are.", "Está means he/she/it is; estamos means we are.", "Estáis means you (plural) are; están means they are.", "Use estar for location: Madrid está en España."], example: "Estamos cansados means “We are tired”; La escuela está aquí means “The school is here”." }
    ],
    worksheets: [
      { title: "The verb estar", questions: [
        { prompt: "Complete: nosotros ______ en casa. (estar)", answer: "nosotros estamos en casa", working: ["The nosotros form of estar is estamos."] },
        { prompt: "Complete: Madrid ______ en España. (estar)", answer: "Madrid está en España", working: ["Use está for a singular place."] },
        { prompt: "What does están mean?", answer: "They are (or you are, formal plural).", working: ["Están is the ellos/ellas/ustedes form."] }
      ] }
    ]
  },
  {
    slug: "geography", title: "Geography", lessonCourse: "Geography", group: "humanities", icon: "⌖", tone: "course-green",
    description: "Understand places, processes and the connections between them.",
    notes: [
      { title: "How rivers shape a valley", summary: "Rivers erode, transport and deposit material, changing the landscape over time.", points: ["Hydraulic action is the force of water against the channel.", "Abrasion occurs when carried material scrapes the bed and banks.", "Erosion can deepen and widen a valley.", "Deposition happens when a river loses energy and drops material."], example: "A river with less energy may deposit sediment on the inside of a bend." }
    ],
    worksheets: [
      { title: "River processes", questions: [
        { prompt: "What is abrasion in a river?", answer: "Material carried by the river scrapes against the bed and banks.", working: ["The transported load wears away the channel."] },
        { prompt: "When is deposition more likely?", answer: "When the river loses energy and can no longer carry its load.", working: ["The river drops some of its transported material."] },
        { prompt: "Name one process that erodes a river channel.", answer: "Hydraulic action or abrasion.", working: ["Both processes wear away the bed or banks."] }
      ] }
    ]
  },
  {
    slug: "computer-science", title: "Computer Science", lessonCourse: "Computer Science", group: "humanities", icon: "01", tone: "course-blue",
    description: "Explore data, algorithms and the systems behind technology.",
    notes: [
      { title: "Representing whole numbers in binary", summary: "Binary uses place values that are powers of two.", points: ["From right to left, the place values begin 1, 2, 4, 8, 16.", "A binary digit is either 0 or 1.", "Add the place values with a 1 to find the denary value.", "An 8-bit unsigned number ranges from 0 to 255."], example: "1101₂ = 8 + 4 + 0 + 1 = 13₁₀." }
    ],
    worksheets: [
      { title: "Binary and denary", questions: [
        { prompt: "Convert 1010₂ to denary.", answer: "10", working: ["8 + 0 + 2 + 0 = 10."] },
        { prompt: "Convert 13₁₀ to 4-bit binary.", answer: "1101₂", working: ["13 = 8 + 4 + 1, so the 8, 4 and 1 columns are set."] },
        { prompt: "What is the largest unsigned value stored in 8 bits?", answer: "255", working: ["All bits set gives 128 + 64 + 32 + 16 + 8 + 4 + 2 + 1 = 255."] }
      ] }
    ]
  }
];
