import type { Mission } from "./types.js";

/* Orientation layer, and the first missions on the path. No language, no
   editor, no runner: this one is assessed by inline questions alone, because
   the thing being taught is a mental model rather than a program. That also
   makes it the only mission a learner can complete on a machine that cannot
   execute anything — which matters, because a true beginner starts here. */

export const MISSIONS_ORIENTATION: Mission[] = [
  {
    id: "how-programs-run",
    stageId: "orientation",
    title: "How programs run",
    tagline: "Before syntax: what actually happens when you press run.",
    type: "concept",
    difficulty: 1,
    estMinutes: 15,
    objectives: [
      "Say what a program is in one sentence",
      "Trace a short list of instructions and say what exists after each one",
      "Explain why the same-looking value can mean two different things",
      "Describe what a bug actually is",
    ],
    prereqIds: [],
    competencyIds: ["prog-model"],
    whyItMatters:
      "Every stage after this one assumes the same picture: instructions run one at a time, in order, on values that carry their own type. Get the picture now and syntax becomes a detail. Skip it and syntax becomes guesswork — you will write lines you cannot predict the result of.",
    lesson: [
      {
        kind: "prose",
        body: "A program is a list of instructions, and a machine runs them one at a time, in order. That is the entire idea; everything else is detail on top of it.\n\nThe machine does not know what you meant — it knows what you wrote. Each instruction is carried out exactly as given, with whatever values are in front of it at that moment. So when a result surprises you, the machine made no mistake: one of your instructions said something you did not intend. That gap between intent and instruction is the thing you are learning to close.",
      },
      {
        kind: "prose",
        body: "Values also carry a type, and the type decides which operations are even possible. The text `\"7\"` and the number `7` look alike and are not the same value: one is a label to be printed, the other a quantity to be added. A machine never guesses which one you meant — the type is part of what you wrote, not something it can infer from the shape of the characters.",
      },
      {
        kind: "example",
        body: "Machine-style instructions, in order. Read them the way the machine does — one line, then the next:",
        code: "1. take the bowl down from the shelf\n2. put the flour in the bowl\n3. put the sugar in the bowl\n4. stir once",
      },
      {
        kind: "example",
        body: "Swap lines 1 and 2 and nothing about the instructions changed except their order — yet the flour now goes onto the shelf instead of into the bowl. Order is not formatting. It is part of the meaning: each step runs on the state the steps before it left behind.",
      },
      {
        kind: "task",
        body: "Take any short list of everyday instructions — a recipe, a route, the steps for starting a device. Trace it the way a machine would: say what exists after each step, one step at a time, before you look at the next. Then change the order of two steps and describe, in one sentence, which step now does the wrong thing to the wrong value. That mismatch is exactly what a bug is.",
      },
    ],
    starterCode: "",
    checks: [],
    questions: [
      {
        id: "o1",
        prompt: "A program runs and produces a result nobody expected. Where did the mistake happen?",
        options: [
          "In the machine — it evaluated the program wrongly",
          "In one of the instructions — it did not say what the author intended",
          "In the order the machine chose for the lines",
          "Nowhere — program output is unpredictable by nature",
        ],
        answer: 1,
        explanation:
          "Machines are obedient, not intuitive. They run the instructions they were given, exactly. A surprising result means an instruction meant something other than what its author thought — which is why reading your own code as instructions, not as intent, is the first skill.",
      },
      {
        id: "o2",
        prompt: "A value can be the text `\"7\"` or the number `7`. Why does the machine care which one it is?",
        options: [
          "It does not — the two are the same value",
          "Because the type decides which operations are allowed, and only one of them can be added",
          "Because text always takes more memory than a number",
          "It only matters when the value gets printed",
        ],
        answer: 1,
        explanation:
          "The type travels with the value and decides what can be done to it. Adding a number to a number is arithmetic; joining two pieces of text is concatenation. Writing `\"7\" + \"3\"` and expecting `10` is not a machine failure — it is a type chosen by accident.",
      },
      {
        id: "o3",
        prompt: "Read this as the machine does, one line at a time. What gets printed?",
        code: "count starts as 3\ncount becomes count + 1\nprint count",
        options: ["3", "4", "31", "Nothing — count was never declared"],
        answer: 1,
        explanation:
          "Line one puts `3` in. Line two computes `3 + 1` and replaces what was there — it does not append. Line three prints whatever the value is now: `4`. Tracing values line by line is the whole of this competency.",
      },
      {
        id: "o4",
        prompt: "Two instructions in a working program are swapped and it stops working. What does that tell you?",
        options: [
          "The machine reorders instructions on its own",
          "The two instructions were unrelated and the break is a coincidence",
          "Order carries meaning: each step runs on the values the earlier steps left behind",
          "The program needed more instructions to begin with",
        ],
        answer: 2,
        explanation:
          "Sequential execution is the model: step two sees the state step one produced. Reorder them and step two now reads a state that was never prepared for it — the values are there, but they are the wrong values.",
      },
    ],
    hintLadder: [
      "Say the instructions out loud, one per line, and after each one name the value that now exists. Do not skip ahead to the end.",
      "Nothing has happened until a line runs, and lines run top to bottom in the order they appear. Order is execution.",
      "The machine never guesses your intent. It does exactly what an instruction says, using the values that are in front of it at that moment.",
      "If the result surprises you, look for the instruction whose meaning differs from what you assumed — the bug lives there, not in the machine.",
      "Transfer: trace a program that prints two lines instead of one. Same motion, one more step, and you have the model every later stage builds on.",
    ],
    misconceptions: [
      "The machine can work out what you meant — it cannot; it runs the instructions you wrote, with the values present at that moment.",
      "Order is just how the file is written — order is execution, and swapping two lines changes which values a step receives.",
      "Types are red tape to satisfy later — the type is part of the value and decides which operations are possible at all.",
    ],
    completionNote: "The machine's model in your own words: order, values, types, and the mistake.",
    masteryNote: "Traced ordered instructions unaided — the mental model is in place before any syntax.",
  },
  {
    id: "input-process-output",
    stageId: "orientation",
    title: "From input to output",
    tagline: "Follow information through a program, not just the instructions.",
    type: "concept",
    difficulty: 1,
    estMinutes: 12,
    objectives: [
      "Distinguish a program's input, processing steps, and output",
      "Trace how different inputs can produce different outputs",
      "Use an output to find which step needs checking",
    ],
    prereqIds: ["how-programs-run"],
    competencyIds: ["prog-model"],
    whyItMatters:
      "A program is more than a list of lines: information enters, instructions transform it, and a result comes out. Seeing those three parts makes it easier to predict what a program should do and to locate the step that made it go wrong.",
    lesson: [
      {
        kind: "prose",
        body: "A program usually receives **input**, follows instructions that **process** it, and produces **output**. Input is information the program starts with; processing is what its instructions do to that information; output is the result someone or something can observe. The input might be a button press, a name, a file, or a value supplied by another program — it is not always something typed on a keyboard.",
      },
      {
        kind: "example",
        body: "Imagine a simple ticket machine. Its input is a destination choice and a payment amount. It looks up the fare, compares the payment with that fare, and then prints a ticket or asks for more money. Those lookup and comparison steps are processing; the message or ticket is output.",
        code: 'input: destination = "Museum", payment = 5\nprocess: fare for Museum is 4; compare 5 with 4\noutput: print ticket and change',
      },
      {
        kind: "prose",
        body: "When the output surprises you, trace the path backward: what input did the program receive, what did each instruction do with it, and where did the result first stop matching what you expected? The output shows what happened, not what the author intended. Check each step against the value it actually received.",
      },
      {
        kind: "task",
        body: "Choose a familiar system — a calculator, a thermostat, or a search box. Name one input, one processing step, and one output. Then change only the input and predict what output should change. Keep outside conditions fixed: a program that reads the clock or network can also change because the outside world changed.",
      },
    ],
    starterCode: "",
    checks: [],
    questions: [
      {
        id: "ipo1",
        prompt: "A ticket machine receives a destination and payment, looks up a fare, then prints a ticket. Which part is the processing?",
        options: [
          "The destination and payment it receives",
          "Looking up the fare and comparing it with the payment",
          "The ticket it prints",
          "The person who wrote the machine's program",
        ],
        answer: 1,
        explanation:
          "Processing is the work the instructions perform on the input. The destination and payment are input; the printed ticket is output.",
      },
      {
        id: "ipo2",
        prompt: "A calculator runs the same add instruction twice, first with 2 and 3, then with 2 and 8. Assume nothing else changes. What should happen?",
        options: [
          "Both runs must produce the same output because the instruction is the same",
          "The second output should differ because the input values differ",
          "The calculator chooses either result unpredictably",
          "Changing inputs changes the instructions themselves",
        ],
        answer: 1,
        explanation:
          "The instructions can stay the same while their input values change. With the outside conditions fixed, the different values lead to a different sum.",
      },
      {
        id: "ipo3",
        prompt: "A program prints 12, but you expected 10. What is the most useful first trace?",
        options: [
          "Assume the printer changed the answer",
          "Check the actual input, then follow what each processing step did with it",
          "Rewrite the final print instruction without looking at the values",
          "Add more instructions until the result looks right",
        ],
        answer: 1,
        explanation:
          "The output is evidence of what the program did. Follow the input through each instruction to find the first step where the actual value differs from the one you expected.",
      },
      {
        id: "ipo4",
        prompt: "A weather program shows a different result even though its instructions are unchanged. What could explain that?",
        options: [
          "A program can never use information from outside itself",
          "Its input or outside conditions, such as newly received weather data, may have changed",
          "The machine must have ignored the instructions",
          "Output is unrelated to input",
        ],
        answer: 1,
        explanation:
          "The same processing can produce a different result when the input changes. Programs can receive new information from the outside world, so compare that input as well as the instructions.",
      },
    ],
    hintLadder: [
      "Name what goes into the system, what the instructions do, and what comes out. A button press can be input; it does not have to be typed text.",
      "The ticket machine receives a choice and payment, looks up and compares values, then prints a result. Those are input, processing, and output in that order.",
      "When the result surprises you, compare the actual input and the value after each instruction with what you expected at that point.",
      "Do not blame the final display before tracing the values. Find the first processing step whose result differs from your prediction.",
      "Transfer: for a thermostat, trace a temperature reading through a threshold comparison to the heating signal. Then change the reading and predict the signal.",
    ],
    misconceptions: [
      "Input always means text typed by a person — a click, sensor reading, file, or response from another program can be input too.",
      "The output tells you what the program meant to do — it only shows the result of the input and instructions it actually received.",
      "Unchanged instructions guarantee an unchanged result — changing input or outside conditions can change the output.",
    ],
    completionNote: "Traced information from input, through processing, to output.",
    masteryNote: "Predicted how a changed input affects output and located a surprising result by tracing steps.",
  },
];
