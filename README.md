# LexiLab  
*A Context-Based Vocabulary Learning System*

---

## 1. Motivation and Background

Through my personal experience with vocabulary learning, I observed that the primary difficulty was not exposure to new words, but the widespread practice of treating vocabulary as isolated units to be memorized. Traditional methods, particularly **flashcard-based learning**, often proved effective for reinforcing words that were already familiar, yet insufficient for the initial acquisition and meaningful understanding of new vocabulary.

This limitation led to a clear realization: memorization alone does not constitute learning. As a result, **LexiLab** was developed with the explicit goal of constructing a **context-driven and sustainable learning process**, rather than another tool focused solely on short-term recall.

---

## 2. System Architecture and Technology Stack

LexiLab is a full-stack web application built using **React** for the frontend and **Flask** for the backend, following a clear separation of concerns:

- **Frontend**  
  Responsible for presenting the learning workflow, managing interactive states, and providing role-specific user interfaces.

- **Backend**  
  Handles persistent learning state, schedules revision sessions based on spaced repetition principles, and enforces role-based access control.

All essential learning behaviors depend on backend-managed state, ensuring continuity across sessions and supporting long-term learning progression rather than transient, one-time interactions.

---

## 3. Core Functionality: Learning and Revision Loops

At the core of LexiLab lies a progressive, context-based **Learning Loop**, reinforced by a complementary **Revision Loop** designed to support durable retention.

### 3.1 Learning Loop

The learning process begins with an intentional screening phase:

- **Synonym Replacement**  
  Quickly filters out words already familiar to the learner, reducing unnecessary repetition.

For words that do not pass this initial screening, learners enter a structured, progressive study loop:

- **Infer meaning from context** to establish an initial understanding  
- **Definition-based Q&A** to solidify explicit recall  
- **Sentence reordering** to reinforce syntactic structure and usage  
- **Final synonym replacement** to verify mastery  

If the learner answers incorrectly at any stage, the system requires the word to be relearned starting from the *infer meaning* step, ensuring that gaps in understanding are addressed rather than bypassed.

Once a word successfully passes the final synonym replacement, it is marked as **mastered**.  
After completing the loop, learners may optionally proceed to a **spelling practice** step for additional reinforcement.

This design prioritizes comprehension and active recall, ensuring that vocabulary is learned through context and usage rather than isolated memorization.

### 3.2 Revision Loop

After a word is marked as mastered, it is automatically scheduled for revision based on intervals derived from the **Ebbinghaus forgetting curve**. Each day, the system selects words due for revision according to this schedule.

The revision process follows the same structure as the learning loop:

- Revision uses the same synonym replacement–first workflow  
- Words that remain familiar pass quickly through the initial screening, enabling efficient review  
- Words that show signs of forgetting are routed back into the full learning loop  

This approach allows revision to function as **rapid reinforcement for well-retained vocabulary**, while seamlessly reactivating deeper learning when necessary, maximizing retention without introducing additional cognitive overhead.

### 3.3 Difficulty Levels

Both the Learning Loop and the Revision Loop support three adjustable difficulty levels—**Normal**, **Advanced**, and **Challenge**—allowing the system to accommodate learners at different proficiency stages.

---

## 4. Teacher Features: Classroom Integration and Support

The teacher-facing component of LexiLab is designed to support the learning loop within authentic classroom environments, rather than function as an independent system.

Teachers are able to:

- Create classes and batch-import students  
- Assign daily vocabulary learning targets  
- Publish vocabulary quizzes, including fill-in-the-blank questions and AI-assisted scoring for sentence-construction tasks  
- Monitor students’ vocabulary completion progress and quiz performance for instructional feedback  

These features enable LexiLab to integrate seamlessly into classroom instruction while preserving the integrity of the student-centered learning model.

---

## 5. Design Trade-offs

### 5.1 No Image / Video-Based Vocabulary Learning

Some peers suggested incorporating images, GIFs, or videos to support vocabulary memorization. After careful consideration, I chose not to adopt a multimedia-first approach for the following reasons:

1. **Content scalability**  
   Curating high-quality images or animations at scale requires substantial time and effort, which would significantly increase content overhead without proportionate learning benefits.

2. **Limited effectiveness for abstract or polysemous words**  
   Many target vocabulary items have multiple meanings or abstract usages. In such cases, visual representations are often ambiguous or misleading, and may oversimplify nuanced meanings.

3. **Preserving reading-centered learning outcomes**  
   A key strength of LexiLab is that it does not only support vocabulary retention, but also trains reading comprehension and the ability to parse longer textual contexts. Shifting emphasis toward visual intuition would weaken this text-based skill development, which is closely tied to reading and writing proficiency.

That said, I also recognize that a purely text-based experience can feel monotonous and may lack sufficient sensory engagement. To address this without compromising the system’s learning goals, LexiLab includes **word pronunciation (audio playback)**. This provides auditory stimulation while simultaneously reinforcing pronunciation and phonological awareness.

### 5.2 Planned Enhancement

To further improve immersion without becoming intrusive, a planned feature is the introduction of **subtle, optional sound effects** for interactions such as answering questions correctly. These audio cues would be lightweight, disableable, and designed to enhance engagement without distracting from the learning process.

---

## 6. Authorship and AI Usage Declaration

During the early stage of this project, my English teacher provided initial ideas related to classroom management and vocabulary-based sentence-construction quizzes, and introduced essential principles of web application security, including role-based access separation.

Building upon these early discussions, I independently developed the **context-based learning and revision loops** that form the core of LexiLab. From that point onward, I was solely responsible for the system architecture, learning logic, data modeling, and all major engineering trade-offs throughout subsequent development.

During implementation, AI tools were extensively used to assist in generating code and content templates. However, all core architectural decisions, logical structures, and design judgments were independently made and fully understood by me.

---

## 7. Concluding Remarks

LexiLab explores a **context-oriented approach to vocabulary learning**, based on the belief that effective vocabulary acquisition emerges from sustained interaction with context rather than isolated memorization.
