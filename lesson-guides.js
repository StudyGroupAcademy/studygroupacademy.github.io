export const lessonGuides = {
  "maths/solving-linear-equations": {
    duration: "18 min",
    stages: [
      { title: "Treat the equation like a balance", text: "The equals sign says that the expressions on its two sides have the same value. An equation stays true only when you make the same change to both sides; think of removing equal weights from the two pans of a scale.", example: "If x + 4 = 9, subtract 4 from both sides to leave x = 5." },
      { title: "Undo operations in reverse order", text: "When an expression has been built in several steps, reverse those steps in the opposite order. Expand brackets first when needed, collect like terms, then undo addition or subtraction before multiplication or division.", example: "For 3x − 1 = 20, add 1 first, then divide by 3." },
      { title: "Check by substitution", text: "A solution is a value that makes the original statement true. Put your answer into the original equation rather than only the simplified line; this catches sign slips and arithmetic errors.", example: "For x = 7 in 3(x − 2) + 5 = 20, the left side becomes 3 × 5 + 5 = 20." }
    ],
    worked: ["Start with 3(x − 2) + 5 = 20.", "Expand: 3x − 6 + 5 = 20, so 3x − 1 = 20.", "Add 1 to both sides: 3x = 21.", "Divide both sides by 3: x = 7.", "Substitute x = 7 into the original equation to check."],
    misconception: "Do not move a term across the equals sign without changing its operation. Writing each operation on both sides makes the balance clear.",
    questions: [
      { prompt: "Solve 4(x + 1) = 28.", answer: "x = 6", why: "Divide by 4 to get x + 1 = 7, then subtract 1." },
      { prompt: "Solve 5x − 7 = 18.", answer: "x = 5", why: "Add 7 to get 5x = 25, then divide by 5." },
      { prompt: "Why should you check a solution in the original equation?", answer: "It confirms the value makes the original statement true.", why: "A mistake made while simplifying may not be visible in the final line." }
    ]
  },
  "maths/percentage-change": {
    duration: "16 min",
    stages: [
      { title: "Find the size of the change", text: "Compare the new amount with the starting amount. For an increase, subtract the original from the new value; for a decrease, subtract the new value from the original.", example: "A cost changes from £40 to £46: the change is £6." },
      { title: "Compare with the original", text: "A percentage is a proportion out of 100. Divide the change by the original amount, because that is the whole you started with; using the final amount changes the question.", example: "£6 ÷ £40 = 0.15." },
      { title: "Convert and state the direction", text: "Multiply the proportion by 100 and label the result as an increase or decrease. Include units only where the question asks for them.", example: "0.15 × 100 = 15%, so the price increased by 15%." }
    ],
    worked: ["Original price = £40; new price = £46.", "Change = £46 − £40 = £6.", "Fraction of original = 6 ÷ 40 = 0.15.", "Percentage change = 0.15 × 100 = 15%.", "State the direction: 15% increase."],
    misconception: "The denominator is the original value, not the new value. Mark the word “original” before calculating to avoid this common error.",
    questions: [
      { prompt: "A quantity falls from 80 to 68. Find the percentage decrease.", answer: "15%", why: "The decrease is 12, and 12 ÷ 80 × 100 = 15%." },
      { prompt: "A price rises from £50 to £60. What is the percentage increase?", answer: "20%", why: "The increase is £10; £10 ÷ £50 × 100 = 20%." },
      { prompt: "Why is the starting value used as the denominator?", answer: "It is the original whole against which the change is compared.", why: "A percentage change describes how much the starting value changed." }
    ]
  },
  "maths/understand-gradient": {
    duration: "17 min",
    stages: [
      { title: "Read gradient as rise over run", text: "Gradient describes the vertical change for each unit of horizontal movement. Choose two points on the same straight line and compare their y-coordinate change with their x-coordinate change.", example: "From (2, 3) to (6, 11), the line rises 8 while moving 4 across." },
      { title: "Keep subtraction in the same order", text: "Subtract the first point's coordinates from the second point's coordinates in both numerator and denominator. This keeps the direction consistent and preserves a negative gradient when the line slopes down.", example: "(11 − 3) ÷ (6 − 2) = 8 ÷ 4." },
      { title: "Interpret the result", text: "A positive gradient rises from left to right; a negative gradient falls. A zero gradient is horizontal. The size tells you how steep the line is.", example: "A gradient of 2 means the line rises 2 units for every 1 unit across." }
    ],
    worked: ["Choose points (2, 3) and (6, 11).", "Change in y = 11 − 3 = 8.", "Change in x = 6 − 2 = 4.", "Gradient = 8 ÷ 4 = 2.", "Check that the line rises as x increases, so a positive answer makes sense."],
    misconception: "Do not swap the order of subtraction in only one coordinate. If you calculate second-minus-first for y, do the same for x.",
    questions: [
      { prompt: "Find the gradient through (1, 7) and (4, 1).", answer: "−2", why: "(1 − 7) ÷ (4 − 1) = −6 ÷ 3 = −2." },
      { prompt: "What is the gradient of a horizontal line?", answer: "0", why: "The vertical change is zero, so rise ÷ run equals zero." },
      { prompt: "A line rises 12 units while moving 3 units right. What is its gradient?", answer: "4", why: "Gradient = rise ÷ run = 12 ÷ 3." }
    ]
  },
  "biology/moving-substances-in-and-out-of-cells": {
    duration: "19 min",
    stages: [
      { title: "Diffusion follows a concentration gradient", text: "Particles move randomly in every direction, but there is a net movement from a region of higher concentration to lower concentration. The steeper the concentration difference, the faster diffusion usually occurs.", example: "Oxygen moves from the air sacs in the lungs, where its concentration is higher, into the blood." },
      { title: "Osmosis is specifically about water", text: "Osmosis is the net movement of water molecules through a partially permeable membrane from a dilute solution to a more concentrated solution. The membrane allows some small molecules through but restricts others.", example: "Water can move into a plant cell when the surrounding solution is more dilute." },
      { title: "Active transport moves against the gradient", text: "Cells sometimes need to take in substances when the concentration outside is lower than inside. Active transport moves particles against their concentration gradient and uses energy released by respiration.", example: "Root hair cells can take up mineral ions from dilute soil." }
    ],
    worked: ["Identify the substance being moved: mineral ions.", "Compare concentrations inside the root hair cell and in the soil.", "The ions move from lower to higher concentration, against the gradient.", "Name the process: active transport.", "Explain that energy from respiration is required."],
    misconception: "Osmosis is not the movement of any dissolved particle; it describes water moving across a partially permeable membrane.",
    questions: [
      { prompt: "Which process moves oxygen from a high concentration in the lungs to a lower concentration in blood?", answer: "Diffusion.", why: "The net movement is down the oxygen concentration gradient." },
      { prompt: "What moves during osmosis?", answer: "Water molecules.", why: "Osmosis is the net movement of water through a partially permeable membrane." },
      { prompt: "Why can root cells use active transport to absorb mineral ions?", answer: "It moves ions against their concentration gradient using energy.", why: "Respiration supplies the energy needed for this movement." }
    ]
  },
  "chemistry/atoms-ions-and-charge": {
    duration: "17 min",
    stages: [
      { title: "Count the charged particles", text: "Protons carry a positive charge and electrons carry a negative charge of equal size. Neutrons have no charge, so they do not affect the overall charge.", example: "An atom with 12 protons and 12 electrons has total charge zero." },
      { title: "Compare protons and electrons", text: "A neutral atom has equal numbers of protons and electrons. The difference between these counts tells you the ion's charge; the number of neutrons is not part of this calculation.", example: "12 protons and 10 electrons means two more positive charges: 2+." },
      { title: "Use electron changes to predict ions", text: "Atoms form ions by gaining or losing electrons. Losing negative electrons leaves a positive ion; gaining negative electrons creates a negative ion.", example: "Magnesium loses two electrons to form Mg²⁺; chlorine gains one to form Cl⁻." }
    ],
    worked: ["A magnesium atom begins with 12 protons and 12 electrons.", "It loses 2 electrons, leaving 10 electrons.", "There are 12 positive charges and 10 negative charges.", "The overall charge is 2+.", "Write the ion symbol as Mg²⁺."],
    misconception: "Losing electrons makes an ion positive, not negative. The protons remain in the nucleus; it is the electron count that changes.",
    questions: [
      { prompt: "A chlorine atom gains one electron. What is its charge?", answer: "1−", why: "One extra electron gives one more negative charge." },
      { prompt: "An atom has 11 protons and 10 electrons. What is its charge?", answer: "1+", why: "There is one more proton than electron." },
      { prompt: "Do neutrons affect an ion's charge?", answer: "No.", why: "Neutrons have no electrical charge." }
    ]
  },
  "physics/current-and-resistance-in-a-series-circuit": {
    duration: "18 min",
    stages: [
      { title: "Understand the single path", text: "A series circuit has one continuous path for charge. Because charge cannot split into separate branches, current is the same at every point in the loop.", example: "If an ammeter reads 0.4 A before a lamp, it reads 0.4 A after the lamp too." },
      { title: "Combine resistance in series", text: "Each component makes it harder for current to flow. In a series circuit the resistances add, so adding another resistor increases the total resistance.", example: "A 2 Ω resistor and a 1 Ω resistor in series have total resistance 3 Ω." },
      { title: "Use the relationship V = IR", text: "Potential difference, current and resistance are linked by V = I × R. Rearrange before substituting: I = V ÷ R, or R = V ÷ I.", example: "A 6 V supply across 3 Ω gives a current of 2 A." }
    ],
    worked: ["Two resistors, 2 Ω and 1 Ω, are connected in series across 6 V.", "Total resistance = 2 + 1 = 3 Ω.", "Use I = V ÷ R.", "Current = 6 ÷ 3 = 2 A.", "The current is 2 A at every point in this series loop."],
    misconception: "Do not add current values in a series circuit; current stays the same. It is the resistance values that add.",
    questions: [
      { prompt: "A 12 V supply is connected across 4 Ω. Find the current.", answer: "3 A", why: "I = V ÷ R = 12 ÷ 4." },
      { prompt: "What is the total resistance of 2 Ω and 5 Ω in series?", answer: "7 Ω", why: "Series resistances add: 2 + 5." },
      { prompt: "What happens to current at different points in one series loop?", answer: "It is the same at every point.", why: "There is only one path for charge." }
    ]
  },
  "english/build-an-analysis-paragraph": {
    duration: "20 min",
    stages: [
      { title: "Make one focused point", text: "Begin with a clear interpretation of the writer's idea, character or mood. Keep the point specific enough that you can prove it with a short quotation.", example: "The writer makes the setting feel threatening." },
      { title: "Choose evidence, then zoom in", text: "Select a precise word or short phrase and identify what it suggests. A method name can help, but the important work is explaining the associations and connotations of the writer's choice.", example: "“The wind clawed at the door” personifies the wind through the verb “clawed”." },
      { title: "Explain the reader's response", text: "Connect the word's associations to the mood or idea you identified. Avoid claiming every reader reacts identically; explain the likely effect and support it with the language.", example: "“Clawed” suggests an animal attacking, so the house seems vulnerable." }
    ],
    worked: ["Point: the setting feels hostile.", "Evidence: the wind is described as “clawed”.", "Zoom: “clawed” is usually associated with an animal scratching or attacking.", "Effect: the weather seems aggressive and the house appears vulnerable.", "Link back to the threatening mood."],
    misconception: "Simply naming a technique is not analysis. Explain what the word suggests and how that suggestion supports your interpretation.",
    questions: [
      { prompt: "What does “clawed” suggest in “The wind clawed at the door”?", answer: "A hostile animal attack, making the setting feel unsafe.", why: "This explains both the word's associations and its effect." },
      { prompt: "Why use a short quotation?", answer: "It keeps analysis focused on precise language.", why: "A small piece of evidence is easier to explore in detail." },
      { prompt: "What should a comment about a technique include?", answer: "Its meaning or associations and its effect in context.", why: "This explains how the writer's choice creates meaning." }
    ]
  },
  "history/explain-a-chain-of-cause-and-consequence": {
    duration: "19 min",
    stages: [
      { title: "Name a precise cause", text: "Identify a factor that contributed to an event or change, and place it in its historical setting. A broad statement such as “people were unhappy” needs a more precise cause to become a convincing explanation.", example: "A poor harvest reduced the amount of food available in a town." },
      { title: "Build the links in the chain", text: "Explain how the cause changed people's circumstances or choices, then show why that change mattered. Connect each step with language such as “because”, “therefore” or “this meant that”.", example: "Scarcity raised prices, which made bread harder for low-income families to afford." },
      { title: "Support and qualify the claim", text: "Use accurate, relevant evidence and avoid claiming one factor explains everything. A strong answer can explain the importance of a factor while recognizing other causes or limits.", example: "Food hardship helped fuel protest, alongside other local and political pressures." }
    ],
    worked: ["Cause: a poor harvest reduced food supplies.", "Link: scarcity pushed food prices higher.", "Consequence: families on low incomes struggled to afford bread.", "Historical impact: hardship increased anger and helped fuel protest.", "Use evidence from the topic to support each relevant link."],
    misconception: "A list of events is not yet a causal explanation. Make the connection between each event explicit and show why one led to another.",
    questions: [
      { prompt: "Which is the clearer explanation: “Prices rose and people protested” or “Rising food prices left families unable to afford bread, helping fuel protests”?", answer: "The second explanation.", why: "It connects rising prices to hardship and then to protest." },
      { prompt: "What supports a historical claim?", answer: "Accurate, relevant evidence.", why: "Evidence allows the reader to judge whether the explanation is convincing." },
      { prompt: "Why place a cause in context?", answer: "Context shows the circumstances that made the cause matter.", why: "The same factor can have different effects in different situations." }
    ]
  },
  "french/regular-present-tense-er-verbs": {
    duration: "18 min",
    stages: [
      { title: "Find the verb stem", text: "For a regular infinitive ending in −er, remove those two letters to reveal the stem. Keep the stem and attach an ending that agrees with the subject pronoun.", example: "parler → parl−." },
      { title: "Match subject to ending", text: "The present-tense endings are −e, −es, −e, −ons, −ez and −ent for je, tu, il/elle, nous, vous and ils/elles. Learn the subject and ending together rather than guessing from the English translation.", example: "nous parlons; vous parlez." },
      { title: "Separate spelling from sound", text: "The written endings carry grammatical information even when they sound alike. In particular, the final −ent in ils/elles forms is silent, so use the subject to choose the spelling.", example: "ils parlent has a written −ent ending, pronounced like the stem." }
    ],
    worked: ["Start with the infinitive parler.", "Remove −er to get the stem parl−.", "For nous, choose the ending −ons.", "Join them: nous parlons.", "For vous, use −ez: vous parlez."],
    misconception: "Do not choose an ending from how the verb sounds. Several endings sound alike; the written subject determines the correct form.",
    questions: [
      { prompt: "How do you say “you (plural/formal) speak”?", answer: "Vous parlez.", why: "Vous takes the −ez ending." },
      { prompt: "Complete: nous ______ (aimer).", answer: "nous aimons", why: "The stem is aim− and the nous ending is −ons." },
      { prompt: "Is the −ent ending in ils parlent pronounced?", answer: "No, it is silent.", why: "The ending is written to show agreement but is not spoken." }
    ]
  },
  "spanish/using-estar-for-temporary-states-and-location": {
    duration: "19 min",
    stages: [
      { title: "Learn the forms of estar", text: "Estar changes to match the subject: estoy, estás, está, estamos, estáis and están. Say the pronoun and verb together so that agreement becomes familiar.", example: "yo estoy; nosotros estamos; ellas están." },
      { title: "Use estar for location", text: "Estar is used to say where a person or thing is. In location sentences, make sure the verb agrees with the thing whose position is being described.", example: "Madrid está en España." },
      { title: "Use estar for states that can change", text: "Estar is also commonly used for conditions or states that may vary, such as being tired. The choice between ser and estar depends on meaning, so learn the context as well as a translation.", example: "Estamos cansados means “We are tired”." }
    ],
    worked: ["Sentence: “We are at home.”", "The subject is nosotros (we).", "The nosotros form of estar is estamos.", "“At home” is en casa.", "Complete sentence: Estamos en casa."],
    misconception: "Do not use the same verb form for every subject. Check who or what the sentence is about before choosing estar.",
    questions: [
      { prompt: "Complete: nosotros ______ en casa.", answer: "estamos", why: "Estamos is the nosotros form." },
      { prompt: "Complete: Madrid ______ en España.", answer: "está", why: "Está agrees with the singular place name Madrid." },
      { prompt: "What does están mean?", answer: "They are, or you are (formal plural).", why: "Están is used with ellos, ellas or ustedes." }
    ]
  },
  "geography/how-rivers-shape-a-valley": {
    duration: "18 min",
    stages: [
      { title: "Understand erosion", text: "Rivers erode their channels through processes such as hydraulic action and abrasion. Hydraulic action is the force of water against the bed and banks; abrasion is caused by transported material scraping them.", example: "Pebbles carried by a river can scrape and wear away the channel." },
      { title: "Connect erosion to valley shape", text: "Over time, erosion can deepen and widen a valley. The balance between vertical and lateral erosion changes downstream and is influenced by discharge, gradient, geology and the river's load.", example: "A steep upper course often has more vertical erosion, helping create a narrow valley." },
      { title: "Explain deposition", text: "A river deposits material when it loses energy and can no longer carry its full load. Deposition can happen where flow slows, such as on the inside of a bend or across a floodplain.", example: "The inside of a meander has slower flow, so sediment may be deposited there." }
    ],
    worked: ["Identify a change in conditions: the river loses energy.", "Lower energy reduces the river's ability to transport its load.", "Some sediment is dropped; this process is deposition.", "At a bend, slower flow on the inside can encourage deposition.", "Link the process to the landform being explained."],
    misconception: "Erosion and deposition are different processes. Erosion removes material; deposition lays transported material down.",
    questions: [
      { prompt: "What is abrasion?", answer: "The river's load scrapes against and wears away the bed and banks.", why: "The transported material causes the erosion." },
      { prompt: "When is deposition more likely?", answer: "When a river loses energy and drops material.", why: "Lower energy means it can carry less of its load." },
      { prompt: "Name one river erosion process.", answer: "Hydraulic action or abrasion.", why: "Both processes wear away the channel." }
    ]
  },
  "computer-science/representing-whole-numbers-in-binary": {
    duration: "18 min",
    stages: [
      { title: "Use powers of two as place values", text: "Binary is a base-two number system. Each position represents a power of two; from right to left, the values begin 1, 2, 4, 8, 16 and continue doubling.", example: "The place values for 1101₂ are 8, 4, 2 and 1." },
      { title: "Convert binary to denary", text: "A binary digit of 1 means include that column's value; 0 means leave it out. Add the selected place values to find the denary number.", example: "1101₂ = 8 + 4 + 0 + 1 = 13₁₀." },
      { title: "Convert denary to binary", text: "Find which powers of two add to the denary value, or repeatedly divide by two and read the remainders in reverse. Keep leading zeroes if a fixed bit-width is requested.", example: "13 = 8 + 4 + 1, so 13₁₀ = 1101₂ in four bits." }
    ],
    worked: ["Write the four-bit place values: 8, 4, 2, 1.", "For 1010₂, include the 8 and 2 columns.", "Add: 8 + 2 = 10.", "Therefore 1010₂ = 10₁₀.", "Check the number of bits matches the question."],
    misconception: "Do not read binary as a string of denary digits. Each 1 contributes its place value; it does not mean “one” on its own.",
    questions: [
      { prompt: "Convert 1010₂ to denary.", answer: "10", why: "8 + 0 + 2 + 0 = 10." },
      { prompt: "Convert 13₁₀ to four-bit binary.", answer: "1101₂", why: "13 = 8 + 4 + 1." },
      { prompt: "What is the largest unsigned number in 8 bits?", answer: "255", why: "The place values add to 128 + 64 + 32 + 16 + 8 + 4 + 2 + 1 = 255." }
    ]
  }
};
