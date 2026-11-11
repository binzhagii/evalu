// The University of Baguio's own evaluation tools (from the Word, Excel and PDF files HR uses).
// Generated from "templates and for printing pdf/". Each form keeps the categories and weights printed on the tool.
// HR can still change any of them under Forms (a new version is made once a form has been used).

/** Every tool uses a 4-point scale. Teaching tools describe how often the indicator is shown. */
export const SCALES = {
  demo: ['Not demonstrated', 'Fairly demonstrated', 'Adequately demonstrated', 'Extensively demonstrated'],
  perf: ['Poor', 'Fair', 'Good', 'Excellent'],
};
export const MAX_RATING = 4;

/** Type of class. Most classes are lectures; some tools are only for laboratory or clinical classes. */
export const CLASS_TYPES = {
  '': 'Lecture (standard form)',
  lab: 'Laboratory class',
  skills: 'Skills laboratory (Nursing)',
  'clin-dent': 'Clinical – Dentistry',
  'clin-pt': 'Clinical – Physical Therapy',
  'clin-mt': 'Clinical – Medical Technology',
};

export const UB_FORMS = [
 {
  "name": "Faculty by the Students (Lecture classes, tertiary)",
  "targetType": "COLLEGE_FACULTY",
  "group": "ST",
  "dept": null,
  "variant": null,
  "categories": [
   {
    "name": "Management of teaching and learning processes",
    "weight": 60,
    "items": [
     {
      "text": "Orients us about the program/course learning objectives"
     },
     {
      "text": "Connects the lessons to real life situations"
     },
     {
      "text": "Relates the lesson to other subjects"
     },
     {
      "text": "Shares relevant information or research findings related to the lesson"
     },
     {
      "text": "Encourages collaborative learning"
     },
     {
      "text": "Asks higher order thinking question (e.g. the why’s and the how’s questions)"
     },
     {
      "text": "Uses a good command of the English language in teaching non-filipino subject; or uses the filipino language in teaching filipino subject"
     },
     {
      "text": "Integrates values in the lessons"
     },
     {
      "text": "Allows students to express their opinions"
     },
     {
      "text": "Ensures that the syllabus content/course outline is taught"
     },
     {
      "text": "Monitors students attendance every meeting"
     }
    ]
   },
   {
    "name": "Assessment of learners & learning environment",
    "weight": 35,
    "items": [
     {
      "text": "Explains the importance of the requirements"
     },
     {
      "text": "Allots realistic time to finish our requirements"
     },
     {
      "text": "Discusses the rubrics before assigning the projects/performances/output"
     },
     {
      "text": "Guides me to improve my performance"
     },
     {
      "text": "Returns corrected and commented outputs on within the grading period"
     },
     {
      "text": "Encourages me to show my creativity in class"
     },
     {
      "text": "Uses different types of activities in class"
     }
    ]
   },
   {
    "name": "Research and Extension",
    "weight": 5,
    "items": [
     {
      "text": "Requires me to support my requirements with reliable and updated references"
     },
     {
      "text": "Encourages me to participate in outreach and community extension activities/services"
     }
    ]
   }
  ]
 },
 {
  "name": "Graduate School / Law Professors by the Students",
  "targetType": "COLLEGE_FACULTY",
  "group": "ST",
  "dept": "GS",
  "variant": null,
  "categories": [
   {
    "name": "Management of teaching and learning processes",
    "weight": 60,
    "items": [
     {
      "text": "Orients us about the program/course learning objectives"
     },
     {
      "text": "Connects the lessons to real life situations"
     },
     {
      "text": "Relates the lesson to other subjects"
     },
     {
      "text": "Shares relevant information or research findings related to the lesson"
     },
     {
      "text": "Encourages collaborative learning"
     },
     {
      "text": "Asks higher order thinking question (e.g. the why’s and the how’s questions)"
     },
     {
      "text": "Uses a good command of the English language in teaching non-filipino subject; or uses the filipino language in teaching filipino subject"
     },
     {
      "text": "Integrates values in the lessons"
     },
     {
      "text": "Allows students to express their opinions"
     },
     {
      "text": "Ensures that the syllabus content/course outline is taught"
     },
     {
      "text": "Monitors students attendance every meeting"
     }
    ]
   },
   {
    "name": "Assessment of learners & learning environment",
    "weight": 35,
    "items": [
     {
      "text": "Explains how the outcome/output/ performance are geared towards the attainment of the program learning outcomes"
     },
     {
      "text": "Allots realistic time to finish our projects/ performances"
     },
     {
      "text": "Discusses the rubrics before assigning the projects/performances/output"
     },
     {
      "text": "Consults with the students to improve my performance"
     },
     {
      "text": "Returns corrected and commented outputs on time"
     },
     {
      "text": "Gives class activities, performance, and output-based requirements that enable me to show my creativity and innovative ideas"
     },
     {
      "text": "Connects the lesson to real-life situation"
     },
     {
      "text": "Uses varied assessment methods and activities"
     }
    ]
   },
   {
    "name": "Research and Extension",
    "weight": 5,
    "items": [
     {
      "text": "Requires me to back up my report/output/ statements/opinions through research findings or varied and reliable references."
     },
     {
      "text": "Encourages me to participate in outreach and community extension activities/services"
     }
    ]
   }
  ]
 },
 {
  "name": "Graduate School / Law Professors by the Students",
  "targetType": "COLLEGE_FACULTY",
  "group": "ST",
  "dept": "SOL",
  "variant": null,
  "categories": [
   {
    "name": "Management of teaching and learning processes",
    "weight": 60,
    "items": [
     {
      "text": "Orients us about the program/course learning objectives"
     },
     {
      "text": "Connects the lessons to real life situations"
     },
     {
      "text": "Relates the lesson to other subjects"
     },
     {
      "text": "Shares relevant information or research findings related to the lesson"
     },
     {
      "text": "Encourages collaborative learning"
     },
     {
      "text": "Asks higher order thinking question (e.g. the why’s and the how’s questions)"
     },
     {
      "text": "Uses a good command of the English language in teaching non-filipino subject; or uses the filipino language in teaching filipino subject"
     },
     {
      "text": "Integrates values in the lessons"
     },
     {
      "text": "Allows students to express their opinions"
     },
     {
      "text": "Ensures that the syllabus content/course outline is taught"
     },
     {
      "text": "Monitors students attendance every meeting"
     }
    ]
   },
   {
    "name": "Assessment of learners & learning environment",
    "weight": 35,
    "items": [
     {
      "text": "Explains how the outcome/output/ performance are geared towards the attainment of the program learning outcomes"
     },
     {
      "text": "Allots realistic time to finish our projects/ performances"
     },
     {
      "text": "Discusses the rubrics before assigning the projects/performances/output"
     },
     {
      "text": "Consults with the students to improve my performance"
     },
     {
      "text": "Returns corrected and commented outputs on time"
     },
     {
      "text": "Gives class activities, performance, and output-based requirements that enable me to show my creativity and innovative ideas"
     },
     {
      "text": "Connects the lesson to real-life situation"
     },
     {
      "text": "Uses varied assessment methods and activities"
     }
    ]
   },
   {
    "name": "Research and Extension",
    "weight": 5,
    "items": [
     {
      "text": "Requires me to back up my report/output/ statements/opinions through research findings or varied and reliable references."
     },
     {
      "text": "Encourages me to participate in outreach and community extension activities/services"
     }
    ]
   }
  ]
 },
 {
  "name": "Teachers by the Students (Laboratory classes)",
  "targetType": "COLLEGE_FACULTY",
  "group": "ST",
  "dept": null,
  "variant": "lab",
  "categories": [
   {
    "name": "INSTRUCTION",
    "weight": 50,
    "items": [
     {
      "text": "Discusses clearly the goals and objectives of the experiment or activity."
     },
     {
      "text": "Communicates clearly the duties and responsibilities of students in the laboratory room."
     },
     {
      "text": "Discusses laboratory procedures or experiments or activities confidently, intelligently concisely."
     },
     {
      "text": "Directs students on how to incorporate theoretical concepts with actual laboratory procedures."
     },
     {
      "text": "Answers question in an expert and sensible manner."
     },
     {
      "text": "Demonstrates laboratory procedures in a systematic, organized and logical manner."
     },
     {
      "text": "Discusses knowledgeably issues and updates related to laboratory issues."
     },
     {
      "text": "Uses a good command of the English language in teaching"
     },
     {
      "text": "Integrates values in teaching the lesson or subject matter"
     }
    ]
   },
   {
    "name": "LABORATORY MANAGEMENT",
    "weight": 20,
    "items": [
     {
      "text": "Plans and organizes and implements laboratory activities as sequences and presented in the laboratory manual."
     },
     {
      "text": "Closely supervises students in the performance of laboratory procedures."
     },
     {
      "text": "Discipline students in a firm and consistent manner based on policies and guidelines as discussed during orientations."
     },
     {
      "text": "Corrects students’ disruptive and annoying behaviors in a constructive and professional manner."
     },
     {
      "text": "Demonstrates responsibility and accountability in supervising and monitoring students’ performance throughout the grading period/s."
     },
     {
      "text": "Checks consistently students’ attendance, prescribed laboratory uniforms, and other required paraphernalia before the start of their daily activity."
     },
     {
      "text": "Encourages meticulous verification of laboratory results."
     },
     {
      "text": "Handles pressing and other unexpected situations in a composed and calm manner."
     },
     {
      "text": "Maximizes time in the learning needs of the students."
     },
     {
      "text": "Checks that students ensure proper documentation of laboratory results on their laboratory manuals or observation sheets."
     },
     {
      "text": "Maintains and creates safe and conducive learning and working environment at all times."
     },
     {
      "text": "Demonstrates flexibility in planning, organizing, implementing and evaluating students’ performance."
     },
     {
      "text": "Dismisses classes punctually not to jeopardize scheduled classes."
     }
    ]
   },
   {
    "name": "EVALUATION",
    "weight": 15,
    "items": [
     {
      "text": "Conducts pre and post laboratory discussions on performed activities."
     },
     {
      "text": "Gives the students challenging and interesting problems, quizzes examinations and assignments whose content coverage is discussed and provided in the syllabi and reference books."
     },
     {
      "text": "Demonstrate fairness in appraising the performance of the students."
     },
     {
      "text": "Checks and returns laboratory requirement on time."
     },
     {
      "text": "Provides immediate and appropriate feed backs on students’ performance."
     },
     {
      "text": "Maintains an accurate record of the progress of students’ performance."
     },
     {
      "text": "Explains clearly the computation of laboratory grades."
     }
    ]
   },
   {
    "name": "PERSONALITY",
    "weight": 15,
    "items": [
     {
      "text": "Manifests readiness and willingness to entertain students’ concerns."
     },
     {
      "text": "Speaks in a clear and well-modulated voice when giving instructions."
     },
     {
      "text": "Displays a sense of humor without sarcasm."
     },
     {
      "text": "Respects students’ individual differences."
     },
     {
      "text": "Manifests energy and enthusiasm in supervising and monitoring students."
     },
     {
      "text": "Promotes self-discipline and models professional and ethical standard expected of a personnel of the University at all times."
     },
     {
      "text": "Demonstrates maturity by using sound judgment/common sense in dealing with pressing and unexpected situations."
     },
     {
      "text": "Maintains confidentiality of information about students."
     },
     {
      "text": "Displays maturity in the exercise of discretion in handling students’ issues and concerns."
     },
     {
      "text": "Looks decent and respectable in his/her general appearance, composure and grooming."
     },
     {
      "text": "Wears the prescribed corporate/laboratory uniform properly and decently."
     },
     {
      "text": "Shows willingness to accept and learn from his/her mistakes."
     }
    ]
   }
  ]
 },
 {
  "name": "Clinical Instructor by the Dentistry Students",
  "targetType": "COLLEGE_FACULTY",
  "group": "ST",
  "dept": null,
  "variant": "clin-dent",
  "categories": [
   {
    "name": "Content knowledge and pedagogy",
    "weight": 30,
    "items": [
     {
      "text": "Demonstrates expertise in operating the technology used in the Dental Infirmary"
     },
     {
      "text": "Answers satisfactorily the questions raised about the activity"
     },
     {
      "text": "Summarizes concepts/theories/procedures briefly before we begin the dental procedures"
     },
     {
      "text": "Integrates relevant research findings in her/his pre-procedural discussions"
     },
     {
      "text": "Gives learning materials that highlight the key theoretical/procedural/safety points of our activity"
     },
     {
      "text": "Gives clear instructions on how we can perform proper dental management of patients."
     },
     {
      "text": "Teaches using techniques that facilitate our comprehension of quality oral health care"
     },
     {
      "text": "Gives comprehensive tips on treatment options for patients"
     },
     {
      "text": "Uses a good command of the English language in teaching"
     },
     {
      "text": "Integrates values in teaching the lesson or subject matter"
     }
    ]
   },
   {
    "name": "Management of the lesson",
    "weight": 25,
    "items": [
     {
      "text": "Reviews the safety issues for the laboratory before making us start the activity"
     },
     {
      "text": "Walks around and stays in his/her post during the clinical period to check that we are making progress"
     },
     {
      "text": "Gives tips on how we can complete our clinical cases on time"
     },
     {
      "text": "Responds quickly to disruptive behavior during laboratory period"
     },
     {
      "text": "Ensures that we adhere to code of ethics in dentistry"
     },
     {
      "text": "Provides opportunities for us to engage in independent learning"
     }
    ]
   },
   {
    "name": "Assessment of learners & learning environment",
    "weight": 40,
    "items": [
     {
      "text": "Asks questions that make me think about why I am doing the activity"
     },
     {
      "text": "Communicates clearly the criteria used in grading my clinical case outputs"
     },
     {
      "text": "Allows me to collaborate with other students in accomplishing my clinical cases"
     },
     {
      "text": "Gives me opportunities to create evidence-based treatment plans for patients"
     },
     {
      "text": "Conducts examinations that allow me to demonstrate my knowledge in performing clinical procedure"
     },
     {
      "text": "Gives assignments that allow me to enhance my skills in addressing the results of patient’s diagnosis"
     }
    ]
   },
   {
    "name": "Research and Extension",
    "weight": 5,
    "items": [
     {
      "text": "Requires me to back up my report/output/statements/opinions through research findings or varied and reliable references"
     },
     {
      "text": "Encouraged me to participate in outreach and community extension activities/services"
     }
    ]
   }
  ]
 },
 {
  "name": "PT Clinical Instructor in the Clinic by the Students",
  "targetType": "COLLEGE_FACULTY",
  "group": "ST",
  "dept": null,
  "variant": "clin-pt",
  "categories": [
   {
    "name": "Content knowledge and pedagogy",
    "weight": 30,
    "items": [
     {
      "text": "Demonstrates expertise in operating the technology used in the PT clinic."
     },
     {
      "text": "Simulates the steps in doing a specific PT procedure according to the patient’s case or condition."
     },
     {
      "text": "Answers satisfactorily the questions raised about the activity"
     },
     {
      "text": "Summarizes concepts/theories/procedures briefly before PT procedures are demonstrated."
     },
     {
      "text": "Integrates relevant research findings in her/his discussions."
     },
     {
      "text": "Gives learning materials that highlight the key theoretical/procedural/safety points of our online activities."
     },
     {
      "text": "Establishes clearly the connection between our internship activities and the theoretical concepts."
     },
     {
      "text": "Gives clear instructions on how we can perform proper PT management of patients."
     },
     {
      "text": "Uses techniques that facilitate our comprehension of quality health care."
     },
     {
      "text": "Gives comprehensive tips on treatment options for patients."
     },
     {
      "text": "Uses a good command of the English language in teaching"
     },
     {
      "text": "Integrates values in teaching the lesson or subject matter"
     }
    ]
   },
   {
    "name": "Management of the lesson",
    "weight": 25,
    "items": [
     {
      "text": "Allows us to critique safety issues given a certain case or scenario."
     },
     {
      "text": "Closely monitors our submission of requirements based on their learning plan."
     },
     {
      "text": "Gives tips on how we can complete the requirements for our internship."
     },
     {
      "text": "Responds quickly to disruptive behavior during our rotation of duties"
     },
     {
      "text": "Provides constant reminders for us to adhere to health protocols in accordance to IATF directives."
     },
     {
      "text": "Provides opportunities for us to engage in independent learning."
     },
     {
      "text": "Strictly adheres to the schedule of activities based on the learning plan."
     }
    ]
   },
   {
    "name": "Assessment of learners & learning environment",
    "weight": 40,
    "items": [
     {
      "text": "Asks questions that make me rationalize on the need for specific physical therapy procedures."
     },
     {
      "text": "Communicates clearly the criteria used in evaluating requirements."
     },
     {
      "text": "Provides comments on accomplished requirements with suggestions for improvement."
     },
     {
      "text": "Allows me to collaborate with other interns in accomplishing identified internship requirements (e.g. journal presentation)."
     },
     {
      "text": "Gives me opportunities to create evidence-based treatment plans for specific cases."
     },
     {
      "text": "Gives tasks that allows me to demonstrate my skills in performing clinical procedures."
     },
     {
      "text": "Provides opportunities for me to enhance my communicative skills."
     },
     {
      "text": "Provides constructive criticisms relating to the performance of physical therapy procedures for patient management"
     },
     {
      "text": "Provides appropriate feedback on policies regarding internship."
     }
    ]
   },
   {
    "name": "Research and Extension",
    "weight": 5,
    "items": [
     {
      "text": "Requires me to back up my report/output/statements/opinions through research findings or varied and reliable references"
     },
     {
      "text": "Encouraged me to participate in outreach and community extension activities/services"
     }
    ]
   }
  ]
 },
 {
  "name": "MedTech Clinical Instructors by the BMLS Interns",
  "targetType": "COLLEGE_FACULTY",
  "group": "ST",
  "dept": null,
  "variant": "clin-mt",
  "categories": [
   {
    "name": "Content knowledge and pedagogy",
    "weight": 30,
    "items": [
     {
      "text": "Demonstrates expertise in operating the technology used in the laboratory."
     },
     {
      "text": "Simulates the laboratory procedures which are routinely performed."
     },
     {
      "text": "Answers satisfactorily the questions raised about the activity a laboratory procedure"
     },
     {
      "text": "Provides an orientation prior to the start of our rotation in the designated section."
     },
     {
      "text": "Integrates relevant research findings in her/his exam rationalizations."
     },
     {
      "text": "Gives learning materials that highlight the key theoretical/procedural/safety points of a laboratory analysis."
     },
     {
      "text": "Establishes clearly the association between the laboratory analysis and results."
     },
     {
      "text": "Gives clear instructions on how clinical laboratory tests are performed for diagnosis, treatment, and management of diseases."
     },
     {
      "text": "Uses techniques that facilitate our comprehension of health care management, biosafety, and waste management."
     },
     {
      "text": "Gives comprehensive tips on collecting and analyzing health information data for improving the health care management system."
     },
     {
      "text": "Uses a good command of the English language in teaching"
     },
     {
      "text": "Integrates values in teaching the lesson or subject matter"
     }
    ]
   },
   {
    "name": "Management of the lesson and learning environment",
    "weight": 25,
    "items": [
     {
      "text": "Allows us to critique laboratory safety issues given a certain case or scenario."
     },
     {
      "text": "Closely monitors our submission of requirements based on their learning plan."
     },
     {
      "text": "Gives tips on how we can complete our internship requirements on time."
     },
     {
      "text": "Responds quickly to disruptive behavior our internship duties"
     },
     {
      "text": "Provides constant reminders for us to adhere to health protocols in accordance to IATF directives."
     },
     {
      "text": "Provides opportunities for us to engage in independent learning."
     },
     {
      "text": "Strictly adheres to the schedule of activities based on the learning plan."
     }
    ]
   },
   {
    "name": "Assessment of learners & learning environment",
    "weight": 40,
    "items": [
     {
      "text": "Asks questions that make me analyze clinical correlations of laboratory test results."
     },
     {
      "text": "Communicates clearly the criteria used in evaluating internship requirements."
     },
     {
      "text": "Provides comments on accomplished section requirements with suggestions for improvement."
     },
     {
      "text": "Allows me to collaborate with other interns in accomplishing identified internship requirements (e.g. journal presentation)."
     },
     {
      "text": "Conducts examinations that allow me to demonstrate my knowledge in the proper collection, handling, and processing of biological specimens."
     },
     {
      "text": "Provides opportunities for me to enhance my communicative skills."
     },
     {
      "text": "Gives activities that allow me to enhance my skills in collecting, analyzing, and using health information data."
     },
     {
      "text": "Provides appropriate feedback on policies regarding virtual internship."
     }
    ]
   },
   {
    "name": "Research and Extension",
    "weight": 5,
    "items": [
     {
      "text": "Requires me to back up my report/output/statements/opinions through research findings or varied and reliable references"
     },
     {
      "text": "Encouraged me to participate in outreach and community extension activities/services"
     }
    ]
   }
  ]
 },
 {
  "name": "Faculty by the Dean / Principal",
  "targetType": "COLLEGE_FACULTY",
  "group": "DEAN",
  "dept": null,
  "variant": null,
  "categories": [
   {
    "name": "Content knowledge and pedagogy",
    "weight": 35,
    "items": [
     {
      "text": "Uses research-based knowledge and principles to corroborate concept being taught"
     },
     {
      "text": "Uses terminologies of the discipline that facilitates the learners’ understanding of the lesson"
     },
     {
      "text": "Elaborates clearly what are written in the instructional materials"
     },
     {
      "text": "Relates the subject matter to real life situation"
     },
     {
      "text": "Provides activities that recognize individual differences"
     },
     {
      "text": "Gives opportunities to develop the communicative skills of the learners"
     },
     {
      "text": "Uses well-prepared instructional materials"
     },
     {
      "text": "Uses teaching strategies that develop the 21st century skills"
     },
     {
      "text": "Asks higher order thinking question (e.g. the why’s and the how’s questions)"
     },
     {
      "text": "Uses the required medium of instruction fluently throughout the learning session"
     },
     {
      "text": "Integrates values in the lessons"
     }
    ]
   },
   {
    "name": "Management of the lesson",
    "weight": 10,
    "items": [
     {
      "text": "Maintains equitable learning environment"
     },
     {
      "text": "Uses differentiated and appropriate learning experiences"
     },
     {
      "text": "Encourages students to express their opinions"
     },
     {
      "text": "Promptly addresses inappropriate behavior of students"
     },
     {
      "text": "Presents the subject matter systematically"
     },
     {
      "text": "Maximizes time on tasks or lesson"
     },
     {
      "text": "Encourages students to ask questions related to the lesson"
     }
    ]
   },
   {
    "name": "Assessment of learners & learning environment",
    "weight": 25,
    "items": [
     {
      "text": "Provides opportunities for the students to develop 21st century skills."
     },
     {
      "text": "Gives opportunities for learners to demonstrate their higher order thinking skills"
     },
     {
      "text": "Gives requirements that encourage students to be creative and resourceful"
     },
     {
      "text": "Gives opportunities for learners to perform roles that will prepare them for their future career"
     },
     {
      "text": "Relates the requirements to the most essential learning competencies, or learning/program outcomes."
     },
     {
      "text": "Evaluates the students’ progress and achievement using varied assessment methods"
     },
     {
      "text": "Conducts consultation with students or other stakeholders"
     },
     {
      "text": "Uses rubric to assess and evaluate the performance/output of students"
     },
     {
      "text": "Ensures the safety and security of learners"
     }
    ]
   },
   {
    "name": "Professional Commitment, Conduct and Deportment",
    "weight": 10,
    "items": [
     {
      "text": "Sticks to required templates and formats in preparation of documents"
     },
     {
      "text": "Adheres to institutional dress code policy"
     },
     {
      "text": "Submits office requirements on time"
     },
     {
      "text": "Records class assessments accurately"
     },
     {
      "text": "Updates licenses and applicable certifications"
     },
     {
      "text": "Attends punctually and regularly scheduled meetings"
     },
     {
      "text": "Attends departmental and institutional INSETs and/or required university events and occasions"
     },
     {
      "text": "Participates actively and collaboratively during meetings and school programs/activities"
     },
     {
      "text": "Attends seminars and trainings related to his/her discipline"
     }
    ]
   },
   {
    "name": "Community Outreach/Extension",
    "weight": 5,
    "items": [
     {
      "text": "Community outreach/extension (per semester)",
      "levels": [
       "One program outreach/extension",
       "Two programs /one school outreach/extension",
       "Three programs/two school outreach/one university outreach",
       "More than three programs /more than two school/two or more university outreach"
      ]
     }
    ]
   },
   {
    "name": "Professional/Civic Linkages",
    "weight": 5,
    "items": [
     {
      "text": "Professional/civic linkages (per school year)",
      "levels": [
       "One local affiliation/membership",
       "One regional affiliation/membership",
       "One national affiliation/membership",
       "Officer in a professional organization/international organization member"
      ]
     }
    ]
   },
   {
    "name": "Professional Engagement",
    "weight": 10,
    "items": [
     {
      "text": "Participation in seminars, trainings, workshops and conferences (per semester)",
      "levels": [
       "In-house (program/school)",
       "One university/two in-house/one local/provincial",
       "Regional",
       "National/International"
      ]
     },
     {
      "text": "Involvement in a seminar, activity or event (per semester)",
      "levels": [
       "As member of working committee (legworks)",
       "As facilitator/moderator/consultant",
       "Judge/coach/trainer/speaker/co-organizer/emcee",
       "Organizer/coordinator/chairperson/activity or narrative report writer"
      ]
     },
     {
      "text": "Research involvement (per semester)",
      "levels": [
       "As respondent/facilitated data gathering",
       "Tool and ethics reviewer/format or language editor/consultant /mentor/participant",
       "Panel",
       "Adviser"
      ]
     }
    ]
   }
  ]
 },
 {
  "name": "Non-Science Laboratory Teacher by the Dean / Principal",
  "targetType": "COLLEGE_FACULTY",
  "group": "DEAN",
  "dept": null,
  "variant": "lab",
  "categories": [
   {
    "name": "Content knowledge and pedagogy",
    "weight": 35,
    "items": [
     {
      "text": "Demonstrates expertise in utilizing the facilities and equipment used in the laboratory class."
     },
     {
      "text": "Demonstrates the steps and/or procedures before making/asking the students do it."
     },
     {
      "text": "Answers satisfactorily the questions raised about the laboratory activity"
     },
     {
      "text": "Explains the theoretical underpinnings of the laboratory exercises or activities"
     },
     {
      "text": "Explains the relevance of the laboratory activities to the students’ lives"
     },
     {
      "text": "Gives clear instructions on how students can perform correctly and successfully the laboratory tasks or activities"
     },
     {
      "text": "Uses techniques that will make the students understand the topic more easily"
     },
     {
      "text": "Gives comprehensive tips on how students enhance their knowledge and skills"
     }
    ]
   },
   {
    "name": "Management of the lesson and learning environment",
    "weight": 10,
    "items": [
     {
      "text": "Reviews with the students and explains clearly the laboratory safety rules and guidelines before the laboratory task/activity"
     },
     {
      "text": "Monitors closely the class as they perform the laboratory activities/tasks."
     },
     {
      "text": "Guides and monitors the students in completing their laboratory requirements"
     },
     {
      "text": "Addresses promptly students’ inappropriate behavior"
     },
     {
      "text": "Ensures that students adhere to all laboratory safety rules and guidelines"
     },
     {
      "text": "Ensures that the facilities, and equipment are ready before the start of the laboratory task/activity"
     },
     {
      "text": "Provides opportunities for students to engage in independent learning."
     },
     {
      "text": "Attend the class regularly and punctually"
     },
     {
      "text": "Integrates values in the laboratory task/activities"
     }
    ]
   },
   {
    "name": "Assessment of learners & learning environment",
    "weight": 35,
    "items": [
     {
      "text": "Gives requirements that help students demonstrate the expected competencies"
     },
     {
      "text": "Explains clearly how the activities/tasks are graded"
     },
     {
      "text": "Provides feedback on students’ performance for improvement."
     },
     {
      "text": "Allows students to collaborate with their classmates"
     },
     {
      "text": "Gives the students opportunities to think critically and analytically"
     },
     {
      "text": "Gives examinations (written and or practical) that allow students to demonstrate their knowledge and skills."
     },
     {
      "text": "Provides opportunities for the students to communicate effectively with their classmates, and teachers."
     },
     {
      "text": "Encourages students to ask questions or seek clarification."
     },
     {
      "text": "Uses rubrics to assess and evaluate the performance/output of students."
     },
     {
      "text": "Gives opportunities for students to improve their class performance"
     },
     {
      "text": "Keeps an accurate record of students’ scores and grades"
     }
    ]
   },
   {
    "name": "Community Outreach/Extension",
    "weight": 5,
    "items": [
     {
      "text": "Community outreach/extension (per semester)",
      "levels": [
       "One school outreach/extension",
       "Two school /one university outreach/extension",
       "Three school/two university outreach/one university outreach",
       "More than two school/two or more university outreach"
      ]
     }
    ]
   },
   {
    "name": "Professional/Civic Linkages",
    "weight": 5,
    "items": [
     {
      "text": "Professional/civic linkages (per school year)",
      "levels": [
       "One local affiliation/membership",
       "One regional affiliation/membership",
       "One national affiliation/membership",
       "Officer in a professional organization/international organization member"
      ]
     }
    ]
   },
   {
    "name": "Professional Engagement",
    "weight": 10,
    "items": [
     {
      "text": "Participation in seminars, trainings, workshops and conferences (per semester)",
      "levels": [
       "In-house (program/school)",
       "One university/two in-house/one local/provincial",
       "Regional",
       "National/International"
      ]
     },
     {
      "text": "Involvement in a seminar, activity or event (per semester)",
      "levels": [
       "As member of working committee (legworks)",
       "As facilitator/moderator/consultant",
       "Judge/coach/trainer/speaker/co-organizer/emcee",
       "Organizer/coordinator/chairperson/activity or narrative report writer"
      ]
     },
     {
      "text": "Research involvement (per semester)",
      "levels": [
       "As respondent/facilitated data gathering",
       "Tool and ethics reviewer/format or language editor/consultant /mentor/participant",
       "Panel",
       "Adviser"
      ]
     }
    ]
   }
  ]
 },
 {
  "name": "Clinical Instructor in the Dental Infirmary by the Dean / Program Chair",
  "targetType": "COLLEGE_FACULTY",
  "group": "DEAN",
  "dept": null,
  "variant": "clin-dent",
  "categories": [
   {
    "name": "Content knowledge and pedagogy",
    "weight": 35,
    "items": [
     {
      "text": "Demonstrates mastery of the subject."
     },
     {
      "text": "Answers satisfactorily the questions raised about the activity."
     },
     {
      "text": "Summarizes concepts/theories/procedures briefly before the class begins the dental procedures."
     },
     {
      "text": "Gives learning materials that highlight the key theoretical/procedural/safety points of the class activity."
     },
     {
      "text": "Establishes clearly the connection between the clinical activity and the theoretical concepts."
     },
     {
      "text": "Uses techniques that facilitate students’ comprehension of quality oral health care."
     },
     {
      "text": "Gives comprehensive tips on treatment options for patients."
     }
    ]
   },
   {
    "name": "Management of the lesson",
    "weight": 10,
    "items": [
     {
      "text": "Reviews the safety issues for the laboratory before the class starts the activity."
     },
     {
      "text": "Periodically supervise the procedure."
     },
     {
      "text": "Gives tips on how students can complete their clinical cases on time."
     },
     {
      "text": "Responds quickly to disruptive behavior during laboratory period."
     },
     {
      "text": "Ensures that the students adhere to code of ethics in dentistry."
     },
     {
      "text": "Ensures the students have the necessary materials before the start of the procedure/avtivity."
     },
     {
      "text": "Provides opportunities for students to engage in independent learning."
     }
    ]
   },
   {
    "name": "Assessment of learners & learning environment",
    "weight": 35,
    "items": [
     {
      "text": "Asks questions that make students think about why they are doing the activity"
     },
     {
      "text": "Communicates clearly the criteria used in grading their clinical case outputs"
     },
     {
      "text": "Allows appropriate collaboration among students"
     },
     {
      "text": "Allows/uses opportunities that represents creation of evidence-based plans"
     },
     {
      "text": "Performs tasks that allows students to demonstrate their skills in performing clinical procedures"
     },
     {
      "text": "Provides opportunities for the students to communicate effectively with patients"
     },
     {
      "text": "Gives tasks that allow students to enhance their skills in addressing the results of patient’s diagnosis"
     },
     {
      "text": "Gives feedback of the students’ performance in the infirmary for the improvement of their skills"
     },
     {
      "text": "Conducts examinations that allow the students to demonstrate their knowledge in clinical procedures."
     },
     {
      "text": "Collects students’ portfolio/logbook"
     }
    ]
   },
   {
    "name": "Community Outreach/Extension",
    "weight": 5,
    "items": [
     {
      "text": "Community outreach/extension (per semester)",
      "levels": [
       "One program outreach/extension",
       "Two programs /one school outreach/extension",
       "Three programs/two school outreach/one university outreach",
       "More than three programs /more than two school/two or more university outreach"
      ]
     }
    ]
   },
   {
    "name": "Professional/Civic Linkages",
    "weight": 5,
    "items": [
     {
      "text": "Professional/civic linkages (per school year)",
      "levels": [
       "One local affiliation/membership",
       "One regional affiliation/membership",
       "One national affiliation/membership",
       "Officer in a professional organization/international organization member"
      ]
     }
    ]
   },
   {
    "name": "Professional Engagement",
    "weight": 10,
    "items": [
     {
      "text": "Participation in seminars, trainings, workshops and conferences (per semester)",
      "levels": [
       "In-house (program/school)",
       "One university/two in-house/one local/provincial",
       "Regional",
       "National/International"
      ]
     },
     {
      "text": "Involvement in a seminar, activity or event (per semester)",
      "levels": [
       "As member of working committee (legworks)",
       "As facilitator/moderator/consultant",
       "Judge/coach/trainer/speaker/co-organizer/emcee",
       "Organizer/coordinator/chairperson/activity or narrative report writer"
      ]
     },
     {
      "text": "Research involvement (per semester)",
      "levels": [
       "As respondent/facilitated data gathering",
       "Tool and ethics reviewer/format or language editor/consultant /mentor/participant",
       "Panel",
       "Adviser"
      ]
     }
    ]
   }
  ]
 },
 {
  "name": "PT Clinical Instructor by the Dean / Program Chair",
  "targetType": "COLLEGE_FACULTY",
  "group": "DEAN",
  "dept": null,
  "variant": "clin-pt",
  "categories": [
   {
    "name": "Content knowledge and pedagogy",
    "weight": 35,
    "items": [
     {
      "text": "Demonstrates expertise in operating the technology used in the PT clinic."
     },
     {
      "text": "Demonstrates the steps in doing the PT procedures."
     },
     {
      "text": "Answers satisfactorily the questions raised about the activity."
     },
     {
      "text": "Summarizes concepts/theories/procedures briefly before students begin the PT procedures."
     },
     {
      "text": "Integrates relevant research findings in her/his discussions."
     },
     {
      "text": "Gives learning materials that highlight the key theoretical/procedural/safety points of the activity."
     },
     {
      "text": "Establishes clearly the connection between the clinical activity and the theoretical concepts."
     },
     {
      "text": "Gives clear instructions on how students can perform proper PT management of patients."
     },
     {
      "text": "Uses techniques that facilitate students comprehension of quality health care."
     },
     {
      "text": "Gives comprehensive tips on treatment options for patients."
     }
    ]
   },
   {
    "name": "Management of the lesson and learning environment",
    "weight": 10,
    "items": [
     {
      "text": "Allows students to critique safety issues given in a certain case or scenario"
     },
     {
      "text": "Walks around and stays in his/her post during the clinical period to check that students are making progress."
     },
     {
      "text": "Gives tips on how students can complete their clinical cases on time."
     },
     {
      "text": "Responds quickly to disruptive behavior during clinic period."
     },
     {
      "text": "Ensures that students adhere to code of ethics in PT."
     },
     {
      "text": "Ensures that the PT apparatuses are ready for use before the activity."
     },
     {
      "text": "Provides opportunities for students to engage in independent learning."
     },
     {
      "text": "Ensures systematic distribution of patient decking."
     },
     {
      "text": "Ensures that students adhere to patient care standards"
     },
     {
      "text": "Ensures that the students adhere to rules and regulations in the clinic/hospital"
     }
    ]
   },
   {
    "name": "Assessment of learners & learning environment",
    "weight": 35,
    "items": [
     {
      "text": "Rationalize on the need for specific PT procedures"
     },
     {
      "text": "Communicates clearly the criteria used in grading clinical case outputs."
     },
     {
      "text": "Returns corrected clinical requirements with suggestions for improvement."
     },
     {
      "text": "Allows students to collaborate with other interns in accomplishing their PT cases."
     },
     {
      "text": "Gives students opportunities to create evidence-based treatment plans for patients."
     },
     {
      "text": "Gives tasks that allows students to demonstrate their skills in performing clinical procedures."
     },
     {
      "text": "Provides opportunities for students to communicate effectively with patients."
     },
     {
      "text": "Gives tasks that allow students to enhance their skills in addressing the results of patient’s diagnosis."
     },
     {
      "text": "Intervenes right away when there’s a perceived problem in handling the apparatus."
     },
     {
      "text": "Mediates immediately when there’s a problem in the management of the patient."
     },
     {
      "text": "Provides appropriate feedback regarding merits and demerits."
     }
    ]
   },
   {
    "name": "Community Outreach/Extension",
    "weight": 5,
    "items": [
     {
      "text": "Community outreach/extension (per semester)",
      "levels": [
       "One school outreach/extension",
       "Two school /one university outreach/extension",
       "Three school/two university outreach/one university outreach",
       "More than two school/two or more university outreach"
      ]
     }
    ]
   },
   {
    "name": "Professional/Civic Linkages",
    "weight": 5,
    "items": [
     {
      "text": "Professional/civic linkages (per school year)",
      "levels": [
       "One local affiliation/membership",
       "One regional affiliation/membership",
       "One national affiliation/membership",
       "Officer in a professional organization/international organization member"
      ]
     }
    ]
   },
   {
    "name": "Professional Engagement",
    "weight": 10,
    "items": [
     {
      "text": "Participation in seminars, trainings, workshops and conferences (per semester)",
      "levels": [
       "In-house (program/school)",
       "One university/two in-house/one local/provincial",
       "Regional",
       "National/International"
      ]
     },
     {
      "text": "Involvement in a seminar, activity or event (per semester)",
      "levels": [
       "As member of working committee (legworks)",
       "As facilitator/moderator/consultant",
       "Judge/coach/trainer/speaker/co-organizer/emcee",
       "Organizer/coordinator/chairperson/activity or narrative report writer"
      ]
     },
     {
      "text": "Research involvement (per semester)",
      "levels": [
       "As respondent/facilitated data gathering",
       "Tool and ethics reviewer/format or language editor/consultant /mentor/participant",
       "Panel",
       "Adviser"
      ]
     }
    ]
   }
  ]
 },
 {
  "name": "MedTech Clinical Instructor in the Clinical Laboratory by the Dean / Program Chair",
  "targetType": "COLLEGE_FACULTY",
  "group": "DEAN",
  "dept": null,
  "variant": "clin-mt",
  "categories": [
   {
    "name": "Content knowledge and pedagogy",
    "weight": 35,
    "items": [
     {
      "text": "Demonstrates expertise in operating the technology used in the laboratory."
     },
     {
      "text": "Demonstrates the steps in doing the laboratory procedures before making the students do it."
     },
     {
      "text": "Answers satisfactorily the questions raised about a laboratory procedure"
     },
     {
      "text": "Gives learning materials that highlight the key theoretical/procedural/safety points of a laboratory analysis."
     },
     {
      "text": "Establishes clearly the association between the laboratory analysis and results."
     },
     {
      "text": "Gives clear instructions on how students can perform clinical laboratory tests for diagnosis, treatment, and management of diseases."
     },
     {
      "text": "Uses techniques that facilitate the comprehension of health care management, biosafety, and waste management."
     },
     {
      "text": "Gives comprehensive tips on collecting and analyzing health information data for improving the health care management system."
     }
    ]
   },
   {
    "name": "Management of the lesson and learning environment",
    "weight": 10,
    "items": [
     {
      "text": "Reviews the safety issues in the laboratory before making the class start any laboratory work."
     },
     {
      "text": "Closely monitors the class as they perform a laboratory procedure."
     },
     {
      "text": "Gives tips on how the students can complete their internship requirements on time (e.g. quotas)."
     },
     {
      "text": "Responds quickly to disruptive behavior in the clinical laboratory."
     },
     {
      "text": "Ensures that students adhere to all laboratory safety rules and regulations."
     },
     {
      "text": "Oversees that equipment/apparatuses/reagents are fully functional and adequate before students perform laboratory work."
     },
     {
      "text": "Provides opportunities for students to engage in independent learning."
     },
     {
      "text": "Starts and dismisses the class on time."
     }
    ]
   },
   {
    "name": "Assessment of learners & learning environment",
    "weight": 35,
    "items": [
     {
      "text": "Asks questions that make the students analyze clinical correlations of laboratory test results."
     },
     {
      "text": "Communicates clearly the criteria used in grading the students’ performance in each section of the clinical laboratory."
     },
     {
      "text": "Provides comments on accomplished quotas with suggestions for improvement."
     },
     {
      "text": "Allows students to collaborate with other interns in accomplishing their internship requirements."
     },
     {
      "text": "Gives the students opportunities to demonstrate analytical and critical thinking skills in the laboratory."
     },
     {
      "text": "Conducts examinations that allow students to demonstrate their knowledge in the proper collection, handling, and processing of biological specimens."
     },
     {
      "text": "Provides opportunities for the students to communicate effectively with patients."
     },
     {
      "text": "Gives activities that allow students to enhance their skills in collecting, analyzing, and using health information data."
     },
     {
      "text": "Encourages students to ask questions"
     },
     {
      "text": "Uses rubrics to assess and evaluate the performance/output of students"
     },
     {
      "text": "Makes himself/herself available to students during consultation hours to address laboratory concerns"
     },
     {
      "text": "Collects students’ portfolio/logbook"
     }
    ]
   },
   {
    "name": "Community Outreach/Extension",
    "weight": 5,
    "items": [
     {
      "text": "Community outreach/extension (per semester)",
      "levels": [
       "One school outreach/extension",
       "Two school /one university outreach/extension",
       "Three school/two university outreach/one university outreach",
       "More than two school/two or more university outreach"
      ]
     }
    ]
   },
   {
    "name": "Professional/Civic Linkages",
    "weight": 5,
    "items": [
     {
      "text": "Professional/civic linkages (per school year)",
      "levels": [
       "One local affiliation/membership",
       "One regional affiliation/membership",
       "One national affiliation/membership",
       "Officer in a professional organization/international organization member"
      ]
     }
    ]
   },
   {
    "name": "Professional Engagement",
    "weight": 10,
    "items": [
     {
      "text": "Participation in seminars, trainings, workshops and conferences (per semester)",
      "levels": [
       "In-house (program/school)",
       "One university/two in-house/one local/provincial",
       "Regional",
       "National/International"
      ]
     },
     {
      "text": "Involvement in a seminar, activity or event (per semester)",
      "levels": [
       "As member of working committee (legworks)",
       "As facilitator/moderator/consultant",
       "Judge/coach/trainer/speaker/co-organizer/emcee",
       "Organizer/coordinator/chairperson/activity or narrative report writer"
      ]
     },
     {
      "text": "Research involvement (per semester)",
      "levels": [
       "As respondent/facilitated data gathering",
       "Tool and ethics reviewer/format or language editor/consultant /mentor/participant",
       "Panel",
       "Adviser"
      ]
     }
    ]
   }
  ]
 },
 {
  "name": "Faculty by the Asst. Principal / Program Chair / Subject Head",
  "targetType": "COLLEGE_FACULTY",
  "group": "CHAIR",
  "dept": null,
  "variant": null,
  "categories": [
   {
    "name": "Content knowledge and pedagogy",
    "weight": 35,
    "items": [
     {
      "text": "Informs the learners of the trends and issues in their discipline"
     },
     {
      "text": "Demonstrates content knowledge and its application within and across curriculum teaching areas"
     },
     {
      "text": "Uses research-based knowledge and principles to corroborate concept being taught"
     },
     {
      "text": "Uses terminologies of the discipline that facilitates the learners’ understanding of the lesson"
     },
     {
      "text": "Elaborates clearly what are written in the instructional materials"
     },
     {
      "text": "Relates the subject matter to real life situation"
     },
     {
      "text": "Provides opportunities for the learners to develop flexibility and tolerance in dealing with people from different cultures"
     },
     {
      "text": "Gives opportunities to develop the communicative skills of the learners"
     },
     {
      "text": "Shows skills in the correct use of ICT and other instructional materials to facilitate teaching and learning"
     },
     {
      "text": "Uses teaching strategies that develop the 21st century skills"
     },
     {
      "text": "Uses strategies that are responsive to learners’ with diverse needs"
     },
     {
      "text": "Asks questions that elicit higher order thinking skills"
     },
     {
      "text": "Uses grammatically correct spoken and written English in teaching"
     },
     {
      "text": "Uses the English language consistently throughout the learning session"
     },
     {
      "text": "Integrates values in teaching the lesson or subject matter"
     }
    ]
   },
   {
    "name": "Management of the lesson",
    "weight": 15,
    "items": [
     {
      "text": "Maintains a learning environment that promotes fairness and respect"
     },
     {
      "text": "Uses differentiated and appropriate learning experiences to address needs of diverse learners"
     },
     {
      "text": "Creates a favorable environment where students may express their informed opinions"
     },
     {
      "text": "Responds appropriately and promptly to disruptive behavior during the class"
     },
     {
      "text": "Presents the subject matter in a systematic sequence"
     },
     {
      "text": "Maximizes time on tasks or lesson"
     },
     {
      "text": "Encourages the students to ask questions, and/or give comments, and answers related to the learning goals"
     }
    ]
   },
   {
    "name": "Assessment of learners & learning environment",
    "weight": 30,
    "items": [
     {
      "text": "Creates a situation where students can respond to the standards or outcomes, and the 21st century skills necessary to become glocally competitive"
     },
     {
      "text": "Gives opportunities for learners to demonstrate their higher order thinking skills"
     },
     {
      "text": "Gives opportunities for learners to show their creativity and innovative ideas"
     },
     {
      "text": "Gives opportunities for learners to propose solutions or suggestions addressing identified problems of the society"
     },
     {
      "text": "Gives opportunities for learners to gives opportunity for students to create/produce products and/or performances that demonstrate their learning and innovation skills using available resources"
     },
     {
      "text": "Gives opportunities for learners to perform roles that demonstrate their life and/or future career skills"
     },
     {
      "text": "Discusses goals for students’ learning aligned with most essential learning competencies, or learning/program outcomes."
     },
     {
      "text": "Evaluates the students’ progress and achievement using varied assessment methods"
     },
     {
      "text": "Makes himself/herself available to students,parents and/or other stakeholders during consultation"
     },
     {
      "text": "Provides effective and immediate feedback on student’s work during consultations."
     },
     {
      "text": "Uses assessment results to improve learning"
     },
     {
      "text": "Uses rubric to assess and evaluate the performance/output of students"
     },
     {
      "text": "Ensures the safety and security of learners"
     }
    ]
   },
   {
    "name": "Professional Commitment, Conduct and Deportment",
    "weight": 20,
    "items": [
     {
      "text": "Follows the design protocol in the formulation and preparation of the syllabus and other school/university documents"
     },
     {
      "text": "Prepares a well-written module, and other instructional materials"
     },
     {
      "text": "Aligns his/her strategies and assessments based on the designed syllabus for PC/AP and SH only"
     },
     {
      "text": "Submits office requirements on time"
     },
     {
      "text": "Records class assessments accurately"
     },
     {
      "text": "Updates licenses and applicable certifications and/or memberships in his/her aligned discipline"
     },
     {
      "text": "Attends punctually and regularly scheduled meetings"
     },
     {
      "text": "Attends departmental and institutional INSETs and/or required university events and occasions"
     },
     {
      "text": "Participates actively and collaboratively during meetings and school programs/activities"
     },
     {
      "text": "Attends seminars and trainings related to his/her discipline"
     }
    ]
   }
  ]
 },
 {
  "name": "Clinical Instructor in the Dental Infirmary by the Dean / Program Chair",
  "targetType": "COLLEGE_FACULTY",
  "group": "CHAIR",
  "dept": null,
  "variant": "clin-dent",
  "categories": [
   {
    "name": "Content knowledge and pedagogy",
    "weight": 35,
    "items": [
     {
      "text": "Demonstrates mastery of the subject."
     },
     {
      "text": "Answers satisfactorily the questions raised about the activity."
     },
     {
      "text": "Summarizes concepts/theories/procedures briefly before the class begins the dental procedures."
     },
     {
      "text": "Gives learning materials that highlight the key theoretical/procedural/safety points of the class activity."
     },
     {
      "text": "Establishes clearly the connection between the clinical activity and the theoretical concepts."
     },
     {
      "text": "Uses techniques that facilitate students’ comprehension of quality oral health care."
     },
     {
      "text": "Gives comprehensive tips on treatment options for patients."
     }
    ]
   },
   {
    "name": "Management of the lesson",
    "weight": 10,
    "items": [
     {
      "text": "Reviews the safety issues for the laboratory before the class starts the activity."
     },
     {
      "text": "Periodically supervise the procedure."
     },
     {
      "text": "Gives tips on how students can complete their clinical cases on time."
     },
     {
      "text": "Responds quickly to disruptive behavior during laboratory period."
     },
     {
      "text": "Ensures that the students adhere to code of ethics in dentistry."
     },
     {
      "text": "Ensures the students have the necessary materials before the start of the procedure/avtivity."
     },
     {
      "text": "Provides opportunities for students to engage in independent learning."
     }
    ]
   },
   {
    "name": "Assessment of learners & learning environment",
    "weight": 35,
    "items": [
     {
      "text": "Asks questions that make students think about why they are doing the activity"
     },
     {
      "text": "Communicates clearly the criteria used in grading their clinical case outputs"
     },
     {
      "text": "Allows appropriate collaboration among students"
     },
     {
      "text": "Allows/uses opportunities that represents creation of evidence-based plans"
     },
     {
      "text": "Performs tasks that allows students to demonstrate their skills in performing clinical procedures"
     },
     {
      "text": "Provides opportunities for the students to communicate effectively with patients"
     },
     {
      "text": "Gives tasks that allow students to enhance their skills in addressing the results of patient’s diagnosis"
     },
     {
      "text": "Gives feedback of the students’ performance in the infirmary for the improvement of their skills"
     },
     {
      "text": "Conducts examinations that allow the students to demonstrate their knowledge in clinical procedures."
     },
     {
      "text": "Collects students’ portfolio/logbook"
     }
    ]
   },
   {
    "name": "Community Outreach/Extension",
    "weight": 5,
    "items": [
     {
      "text": "Community outreach/extension (per semester)",
      "levels": [
       "One program outreach/extension",
       "Two programs /one school outreach/extension",
       "Three programs/two school outreach/one university outreach",
       "More than three programs /more than two school/two or more university outreach"
      ]
     }
    ]
   },
   {
    "name": "Professional/Civic Linkages",
    "weight": 5,
    "items": [
     {
      "text": "Professional/civic linkages (per school year)",
      "levels": [
       "One local affiliation/membership",
       "One regional affiliation/membership",
       "One national affiliation/membership",
       "Officer in a professional organization/international organization member"
      ]
     }
    ]
   },
   {
    "name": "Professional Engagement",
    "weight": 10,
    "items": [
     {
      "text": "Participation in seminars, trainings, workshops and conferences (per semester)",
      "levels": [
       "In-house (program/school)",
       "One university/two in-house/one local/provincial",
       "Regional",
       "National/International"
      ]
     },
     {
      "text": "Involvement in a seminar, activity or event (per semester)",
      "levels": [
       "As member of working committee (legworks)",
       "As facilitator/moderator/consultant",
       "Judge/coach/trainer/speaker/co-organizer/emcee",
       "Organizer/coordinator/chairperson/activity or narrative report writer"
      ]
     },
     {
      "text": "Research involvement (per semester)",
      "levels": [
       "As respondent/facilitated data gathering",
       "Tool and ethics reviewer/format or language editor/consultant /mentor/participant",
       "Panel",
       "Adviser"
      ]
     }
    ]
   }
  ]
 },
 {
  "name": "PT Clinical Instructor by the Dean / Program Chair",
  "targetType": "COLLEGE_FACULTY",
  "group": "CHAIR",
  "dept": null,
  "variant": "clin-pt",
  "categories": [
   {
    "name": "Content knowledge and pedagogy",
    "weight": 35,
    "items": [
     {
      "text": "Demonstrates expertise in operating the technology used in the PT clinic."
     },
     {
      "text": "Demonstrates the steps in doing the PT procedures."
     },
     {
      "text": "Answers satisfactorily the questions raised about the activity."
     },
     {
      "text": "Summarizes concepts/theories/procedures briefly before students begin the PT procedures."
     },
     {
      "text": "Integrates relevant research findings in her/his discussions."
     },
     {
      "text": "Gives learning materials that highlight the key theoretical/procedural/safety points of the activity."
     },
     {
      "text": "Establishes clearly the connection between the clinical activity and the theoretical concepts."
     },
     {
      "text": "Gives clear instructions on how students can perform proper PT management of patients."
     },
     {
      "text": "Uses techniques that facilitate students comprehension of quality health care."
     },
     {
      "text": "Gives comprehensive tips on treatment options for patients."
     }
    ]
   },
   {
    "name": "Management of the lesson and learning environment",
    "weight": 10,
    "items": [
     {
      "text": "Allows students to critique safety issues given in a certain case or scenario"
     },
     {
      "text": "Walks around and stays in his/her post during the clinical period to check that students are making progress."
     },
     {
      "text": "Gives tips on how students can complete their clinical cases on time."
     },
     {
      "text": "Responds quickly to disruptive behavior during clinic period."
     },
     {
      "text": "Ensures that students adhere to code of ethics in PT."
     },
     {
      "text": "Ensures that the PT apparatuses are ready for use before the activity."
     },
     {
      "text": "Provides opportunities for students to engage in independent learning."
     },
     {
      "text": "Ensures systematic distribution of patient decking."
     },
     {
      "text": "Ensures that students adhere to patient care standards"
     },
     {
      "text": "Ensures that the students adhere to rules and regulations in the clinic/hospital"
     }
    ]
   },
   {
    "name": "Assessment of learners & learning environment",
    "weight": 35,
    "items": [
     {
      "text": "Rationalize on the need for specific PT procedures"
     },
     {
      "text": "Communicates clearly the criteria used in grading clinical case outputs."
     },
     {
      "text": "Returns corrected clinical requirements with suggestions for improvement."
     },
     {
      "text": "Allows students to collaborate with other interns in accomplishing their PT cases."
     },
     {
      "text": "Gives students opportunities to create evidence-based treatment plans for patients."
     },
     {
      "text": "Gives tasks that allows students to demonstrate their skills in performing clinical procedures."
     },
     {
      "text": "Provides opportunities for students to communicate effectively with patients."
     },
     {
      "text": "Gives tasks that allow students to enhance their skills in addressing the results of patient’s diagnosis."
     },
     {
      "text": "Intervenes right away when there’s a perceived problem in handling the apparatus."
     },
     {
      "text": "Mediates immediately when there’s a problem in the management of the patient."
     },
     {
      "text": "Provides appropriate feedback regarding merits and demerits."
     }
    ]
   },
   {
    "name": "Community Outreach/Extension",
    "weight": 5,
    "items": [
     {
      "text": "Community outreach/extension (per semester)",
      "levels": [
       "One school outreach/extension",
       "Two school /one university outreach/extension",
       "Three school/two university outreach/one university outreach",
       "More than two school/two or more university outreach"
      ]
     }
    ]
   },
   {
    "name": "Professional/Civic Linkages",
    "weight": 5,
    "items": [
     {
      "text": "Professional/civic linkages (per school year)",
      "levels": [
       "One local affiliation/membership",
       "One regional affiliation/membership",
       "One national affiliation/membership",
       "Officer in a professional organization/international organization member"
      ]
     }
    ]
   },
   {
    "name": "Professional Engagement",
    "weight": 10,
    "items": [
     {
      "text": "Participation in seminars, trainings, workshops and conferences (per semester)",
      "levels": [
       "In-house (program/school)",
       "One university/two in-house/one local/provincial",
       "Regional",
       "National/International"
      ]
     },
     {
      "text": "Involvement in a seminar, activity or event (per semester)",
      "levels": [
       "As member of working committee (legworks)",
       "As facilitator/moderator/consultant",
       "Judge/coach/trainer/speaker/co-organizer/emcee",
       "Organizer/coordinator/chairperson/activity or narrative report writer"
      ]
     },
     {
      "text": "Research involvement (per semester)",
      "levels": [
       "As respondent/facilitated data gathering",
       "Tool and ethics reviewer/format or language editor/consultant /mentor/participant",
       "Panel",
       "Adviser"
      ]
     }
    ]
   }
  ]
 },
 {
  "name": "MedTech Clinical Instructor in the Clinical Laboratory by the Dean / Program Chair",
  "targetType": "COLLEGE_FACULTY",
  "group": "CHAIR",
  "dept": null,
  "variant": "clin-mt",
  "categories": [
   {
    "name": "Content knowledge and pedagogy",
    "weight": 35,
    "items": [
     {
      "text": "Demonstrates expertise in operating the technology used in the laboratory."
     },
     {
      "text": "Demonstrates the steps in doing the laboratory procedures before making the students do it."
     },
     {
      "text": "Answers satisfactorily the questions raised about a laboratory procedure"
     },
     {
      "text": "Gives learning materials that highlight the key theoretical/procedural/safety points of a laboratory analysis."
     },
     {
      "text": "Establishes clearly the association between the laboratory analysis and results."
     },
     {
      "text": "Gives clear instructions on how students can perform clinical laboratory tests for diagnosis, treatment, and management of diseases."
     },
     {
      "text": "Uses techniques that facilitate the comprehension of health care management, biosafety, and waste management."
     },
     {
      "text": "Gives comprehensive tips on collecting and analyzing health information data for improving the health care management system."
     }
    ]
   },
   {
    "name": "Management of the lesson and learning environment",
    "weight": 10,
    "items": [
     {
      "text": "Reviews the safety issues in the laboratory before making the class start any laboratory work."
     },
     {
      "text": "Closely monitors the class as they perform a laboratory procedure."
     },
     {
      "text": "Gives tips on how the students can complete their internship requirements on time (e.g. quotas)."
     },
     {
      "text": "Responds quickly to disruptive behavior in the clinical laboratory."
     },
     {
      "text": "Ensures that students adhere to all laboratory safety rules and regulations."
     },
     {
      "text": "Oversees that equipment/apparatuses/reagents are fully functional and adequate before students perform laboratory work."
     },
     {
      "text": "Provides opportunities for students to engage in independent learning."
     },
     {
      "text": "Starts and dismisses the class on time."
     }
    ]
   },
   {
    "name": "Assessment of learners & learning environment",
    "weight": 35,
    "items": [
     {
      "text": "Asks questions that make the students analyze clinical correlations of laboratory test results."
     },
     {
      "text": "Communicates clearly the criteria used in grading the students’ performance in each section of the clinical laboratory."
     },
     {
      "text": "Provides comments on accomplished quotas with suggestions for improvement."
     },
     {
      "text": "Allows students to collaborate with other interns in accomplishing their internship requirements."
     },
     {
      "text": "Gives the students opportunities to demonstrate analytical and critical thinking skills in the laboratory."
     },
     {
      "text": "Conducts examinations that allow students to demonstrate their knowledge in the proper collection, handling, and processing of biological specimens."
     },
     {
      "text": "Provides opportunities for the students to communicate effectively with patients."
     },
     {
      "text": "Gives activities that allow students to enhance their skills in collecting, analyzing, and using health information data."
     },
     {
      "text": "Encourages students to ask questions"
     },
     {
      "text": "Uses rubrics to assess and evaluate the performance/output of students"
     },
     {
      "text": "Makes himself/herself available to students during consultation hours to address laboratory concerns"
     },
     {
      "text": "Collects students’ portfolio/logbook"
     }
    ]
   },
   {
    "name": "Community Outreach/Extension",
    "weight": 5,
    "items": [
     {
      "text": "Community outreach/extension (per semester)",
      "levels": [
       "One school outreach/extension",
       "Two school /one university outreach/extension",
       "Three school/two university outreach/one university outreach",
       "More than two school/two or more university outreach"
      ]
     }
    ]
   },
   {
    "name": "Professional/Civic Linkages",
    "weight": 5,
    "items": [
     {
      "text": "Professional/civic linkages (per school year)",
      "levels": [
       "One local affiliation/membership",
       "One regional affiliation/membership",
       "One national affiliation/membership",
       "Officer in a professional organization/international organization member"
      ]
     }
    ]
   },
   {
    "name": "Professional Engagement",
    "weight": 10,
    "items": [
     {
      "text": "Participation in seminars, trainings, workshops and conferences (per semester)",
      "levels": [
       "In-house (program/school)",
       "One university/two in-house/one local/provincial",
       "Regional",
       "National/International"
      ]
     },
     {
      "text": "Involvement in a seminar, activity or event (per semester)",
      "levels": [
       "As member of working committee (legworks)",
       "As facilitator/moderator/consultant",
       "Judge/coach/trainer/speaker/co-organizer/emcee",
       "Organizer/coordinator/chairperson/activity or narrative report writer"
      ]
     },
     {
      "text": "Research involvement (per semester)",
      "levels": [
       "As respondent/facilitated data gathering",
       "Tool and ethics reviewer/format or language editor/consultant /mentor/participant",
       "Panel",
       "Adviser"
      ]
     }
    ]
   }
  ]
 },
 {
  "name": "Faculty by the Students (Grade 4-12)",
  "targetType": "BASICED_TEACHER",
  "group": "ST",
  "dept": null,
  "variant": null,
  "categories": [
   {
    "name": "Management of teaching and learning processes",
    "weight": 60,
    "items": [
     {
      "text": "Communicates clearly the objectives of the lesson"
     },
     {
      "text": "Allows me to think critically"
     },
     {
      "text": "Gives varied learning activities"
     },
     {
      "text": "Relates the lessons with other subjects or real-life situations"
     },
     {
      "text": "Gives updates and additional information related to the subject"
     },
     {
      "text": "Helps me to enhance my creativity and communication skills"
     },
     {
      "text": "Connects the lessons to the school’s vision, mission, objective, core values and graduate attributes"
     },
     {
      "text": "Integrates values in the lessons"
     },
     {
      "text": "Ensures that I behave appropriately"
     },
     {
      "text": "Encourages me to become a responsible leader"
     },
     {
      "text": "Provides activities that recognize individual differences"
     },
     {
      "text": "Ensures safety in the class"
     },
     {
      "text": "Monitors the students attendance every meeting"
     }
    ]
   },
   {
    "name": "Assessment of learners & learning environment",
    "weight": 40,
    "items": [
     {
      "text": "Helps me improve my performance in school"
     },
     {
      "text": "Allows me to use resources I have in my requirements"
     },
     {
      "text": "Guides me to achieve the learning competencies"
     },
     {
      "text": "Allots enough time to complete our requirement"
     },
     {
      "text": "Discusses first the rubrics before assigning the tasks"
     },
     {
      "text": "Returns corrected activities within the grading period"
     },
     {
      "text": "Provides feedbacks on our tasks for improvement"
     }
    ]
   }
  ]
 },
 {
  "name": "Faculty by the Dean / Principal",
  "targetType": "BASICED_TEACHER",
  "group": "PRIN",
  "dept": null,
  "variant": null,
  "categories": [
   {
    "name": "Content knowledge and pedagogy",
    "weight": 35,
    "items": [
     {
      "text": "Uses research-based knowledge and principles to corroborate concept being taught"
     },
     {
      "text": "Uses terminologies of the discipline that facilitates the learners’ understanding of the lesson"
     },
     {
      "text": "Elaborates clearly what are written in the instructional materials"
     },
     {
      "text": "Relates the subject matter to real life situation"
     },
     {
      "text": "Provides activities that recognize individual differences"
     },
     {
      "text": "Gives opportunities to develop the communicative skills of the learners"
     },
     {
      "text": "Uses well-prepared instructional materials"
     },
     {
      "text": "Uses teaching strategies that develop the 21st century skills"
     },
     {
      "text": "Asks higher order thinking question (e.g. the why’s and the how’s questions)"
     },
     {
      "text": "Uses the required medium of instruction fluently throughout the learning session"
     },
     {
      "text": "Integrates values in the lessons"
     }
    ]
   },
   {
    "name": "Management of the lesson",
    "weight": 10,
    "items": [
     {
      "text": "Maintains equitable learning environment"
     },
     {
      "text": "Uses differentiated and appropriate learning experiences"
     },
     {
      "text": "Encourages students to express their opinions"
     },
     {
      "text": "Promptly addresses inappropriate behavior of students"
     },
     {
      "text": "Presents the subject matter systematically"
     },
     {
      "text": "Maximizes time on tasks or lesson"
     },
     {
      "text": "Encourages students to ask questions related to the lesson"
     }
    ]
   },
   {
    "name": "Assessment of learners & learning environment",
    "weight": 25,
    "items": [
     {
      "text": "Provides opportunities for the students to develop 21st century skills."
     },
     {
      "text": "Gives opportunities for learners to demonstrate their higher order thinking skills"
     },
     {
      "text": "Gives requirements that encourage students to be creative and resourceful"
     },
     {
      "text": "Gives opportunities for learners to perform roles that will prepare them for their future career"
     },
     {
      "text": "Relates the requirements to the most essential learning competencies, or learning/program outcomes."
     },
     {
      "text": "Evaluates the students’ progress and achievement using varied assessment methods"
     },
     {
      "text": "Conducts consultation with students or other stakeholders"
     },
     {
      "text": "Uses rubric to assess and evaluate the performance/output of students"
     },
     {
      "text": "Ensures the safety and security of learners"
     }
    ]
   },
   {
    "name": "Professional Commitment, Conduct and Deportment",
    "weight": 10,
    "items": [
     {
      "text": "Sticks to required templates and formats in preparation of documents"
     },
     {
      "text": "Adheres to institutional dress code policy"
     },
     {
      "text": "Submits office requirements on time"
     },
     {
      "text": "Records class assessments accurately"
     },
     {
      "text": "Updates licenses and applicable certifications"
     },
     {
      "text": "Attends punctually and regularly scheduled meetings"
     },
     {
      "text": "Attends departmental and institutional INSETs and/or required university events and occasions"
     },
     {
      "text": "Participates actively and collaboratively during meetings and school programs/activities"
     },
     {
      "text": "Attends seminars and trainings related to his/her discipline"
     }
    ]
   },
   {
    "name": "Community Outreach/Extension",
    "weight": 5,
    "items": [
     {
      "text": "Community outreach/extension (per semester)",
      "levels": [
       "One program outreach/extension",
       "Two programs /one school outreach/extension",
       "Three programs/two school outreach/one university outreach",
       "More than three programs /more than two school/two or more university outreach"
      ]
     }
    ]
   },
   {
    "name": "Professional/Civic Linkages",
    "weight": 5,
    "items": [
     {
      "text": "Professional/civic linkages (per school year)",
      "levels": [
       "One local affiliation/membership",
       "One regional affiliation/membership",
       "One national affiliation/membership",
       "Officer in a professional organization/international organization member"
      ]
     }
    ]
   },
   {
    "name": "Professional Engagement",
    "weight": 10,
    "items": [
     {
      "text": "Participation in seminars, trainings, workshops and conferences (per semester)",
      "levels": [
       "In-house (program/school)",
       "One university/two in-house/one local/provincial",
       "Regional",
       "National/International"
      ]
     },
     {
      "text": "Involvement in a seminar, activity or event (per semester)",
      "levels": [
       "As member of working committee (legworks)",
       "As facilitator/moderator/consultant",
       "Judge/coach/trainer/speaker/co-organizer/emcee",
       "Organizer/coordinator/chairperson/activity or narrative report writer"
      ]
     },
     {
      "text": "Research involvement (per semester)",
      "levels": [
       "As respondent/facilitated data gathering",
       "Tool and ethics reviewer/format or language editor/consultant /mentor/participant",
       "Panel",
       "Adviser"
      ]
     }
    ]
   }
  ]
 },
 {
  "name": "Faculty by the Asst. Principal / Program Chair / Subject Head",
  "targetType": "BASICED_TEACHER",
  "group": "APRIN",
  "dept": null,
  "variant": null,
  "categories": [
   {
    "name": "Content knowledge and pedagogy",
    "weight": 35,
    "items": [
     {
      "text": "Informs the learners of the trends and issues in their discipline"
     },
     {
      "text": "Demonstrates content knowledge and its application within and across curriculum teaching areas"
     },
     {
      "text": "Uses research-based knowledge and principles to corroborate concept being taught"
     },
     {
      "text": "Uses terminologies of the discipline that facilitates the learners’ understanding of the lesson"
     },
     {
      "text": "Elaborates clearly what are written in the instructional materials"
     },
     {
      "text": "Relates the subject matter to real life situation"
     },
     {
      "text": "Provides opportunities for the learners to develop flexibility and tolerance in dealing with people from different cultures"
     },
     {
      "text": "Gives opportunities to develop the communicative skills of the learners"
     },
     {
      "text": "Shows skills in the correct use of ICT and other instructional materials to facilitate teaching and learning"
     },
     {
      "text": "Uses teaching strategies that develop the 21st century skills"
     },
     {
      "text": "Uses strategies that are responsive to learners’ with diverse needs"
     },
     {
      "text": "Asks questions that elicit higher order thinking skills"
     },
     {
      "text": "Uses grammatically correct spoken and written English in teaching"
     },
     {
      "text": "Uses the English language consistently throughout the learning session"
     },
     {
      "text": "Integrates values in teaching the lesson or subject matter"
     }
    ]
   },
   {
    "name": "Management of the lesson",
    "weight": 15,
    "items": [
     {
      "text": "Maintains a learning environment that promotes fairness and respect"
     },
     {
      "text": "Uses differentiated and appropriate learning experiences to address needs of diverse learners"
     },
     {
      "text": "Creates a favorable environment where students may express their informed opinions"
     },
     {
      "text": "Responds appropriately and promptly to disruptive behavior during the class"
     },
     {
      "text": "Presents the subject matter in a systematic sequence"
     },
     {
      "text": "Maximizes time on tasks or lesson"
     },
     {
      "text": "Encourages the students to ask questions, and/or give comments, and answers related to the learning goals"
     }
    ]
   },
   {
    "name": "Assessment of learners & learning environment",
    "weight": 30,
    "items": [
     {
      "text": "Creates a situation where students can respond to the standards or outcomes, and the 21st century skills necessary to become glocally competitive"
     },
     {
      "text": "Gives opportunities for learners to demonstrate their higher order thinking skills"
     },
     {
      "text": "Gives opportunities for learners to show their creativity and innovative ideas"
     },
     {
      "text": "Gives opportunities for learners to propose solutions or suggestions addressing identified problems of the society"
     },
     {
      "text": "Gives opportunities for learners to gives opportunity for students to create/produce products and/or performances that demonstrate their learning and innovation skills using available resources"
     },
     {
      "text": "Gives opportunities for learners to perform roles that demonstrate their life and/or future career skills"
     },
     {
      "text": "Discusses goals for students’ learning aligned with most essential learning competencies, or learning/program outcomes."
     },
     {
      "text": "Evaluates the students’ progress and achievement using varied assessment methods"
     },
     {
      "text": "Makes himself/herself available to students,parents and/or other stakeholders during consultation"
     },
     {
      "text": "Provides effective and immediate feedback on student’s work during consultations."
     },
     {
      "text": "Uses assessment results to improve learning"
     },
     {
      "text": "Uses rubric to assess and evaluate the performance/output of students"
     },
     {
      "text": "Ensures the safety and security of learners"
     }
    ]
   },
   {
    "name": "Professional Commitment, Conduct and Deportment",
    "weight": 20,
    "items": [
     {
      "text": "Follows the design protocol in the formulation and preparation of the syllabus and other school/university documents"
     },
     {
      "text": "Prepares a well-written module, and other instructional materials"
     },
     {
      "text": "Aligns his/her strategies and assessments based on the designed syllabus for PC/AP and SH only"
     },
     {
      "text": "Submits office requirements on time"
     },
     {
      "text": "Records class assessments accurately"
     },
     {
      "text": "Updates licenses and applicable certifications and/or memberships in his/her aligned discipline"
     },
     {
      "text": "Attends punctually and regularly scheduled meetings"
     },
     {
      "text": "Attends departmental and institutional INSETs and/or required university events and occasions"
     },
     {
      "text": "Participates actively and collaboratively during meetings and school programs/activities"
     },
     {
      "text": "Attends seminars and trainings related to his/her discipline"
     }
    ]
   }
  ]
 },
 {
  "name": "Faculty by the Asst. Principal / Program Chair / Subject Head",
  "targetType": "BASICED_TEACHER",
  "group": "SHEAD",
  "dept": null,
  "variant": null,
  "categories": [
   {
    "name": "Content knowledge and pedagogy",
    "weight": 35,
    "items": [
     {
      "text": "Informs the learners of the trends and issues in their discipline"
     },
     {
      "text": "Demonstrates content knowledge and its application within and across curriculum teaching areas"
     },
     {
      "text": "Uses research-based knowledge and principles to corroborate concept being taught"
     },
     {
      "text": "Uses terminologies of the discipline that facilitates the learners’ understanding of the lesson"
     },
     {
      "text": "Elaborates clearly what are written in the instructional materials"
     },
     {
      "text": "Relates the subject matter to real life situation"
     },
     {
      "text": "Provides opportunities for the learners to develop flexibility and tolerance in dealing with people from different cultures"
     },
     {
      "text": "Gives opportunities to develop the communicative skills of the learners"
     },
     {
      "text": "Shows skills in the correct use of ICT and other instructional materials to facilitate teaching and learning"
     },
     {
      "text": "Uses teaching strategies that develop the 21st century skills"
     },
     {
      "text": "Uses strategies that are responsive to learners’ with diverse needs"
     },
     {
      "text": "Asks questions that elicit higher order thinking skills"
     },
     {
      "text": "Uses grammatically correct spoken and written English in teaching"
     },
     {
      "text": "Uses the English language consistently throughout the learning session"
     },
     {
      "text": "Integrates values in teaching the lesson or subject matter"
     }
    ]
   },
   {
    "name": "Management of the lesson",
    "weight": 15,
    "items": [
     {
      "text": "Maintains a learning environment that promotes fairness and respect"
     },
     {
      "text": "Uses differentiated and appropriate learning experiences to address needs of diverse learners"
     },
     {
      "text": "Creates a favorable environment where students may express their informed opinions"
     },
     {
      "text": "Responds appropriately and promptly to disruptive behavior during the class"
     },
     {
      "text": "Presents the subject matter in a systematic sequence"
     },
     {
      "text": "Maximizes time on tasks or lesson"
     },
     {
      "text": "Encourages the students to ask questions, and/or give comments, and answers related to the learning goals"
     }
    ]
   },
   {
    "name": "Assessment of learners & learning environment",
    "weight": 30,
    "items": [
     {
      "text": "Creates a situation where students can respond to the standards or outcomes, and the 21st century skills necessary to become glocally competitive"
     },
     {
      "text": "Gives opportunities for learners to demonstrate their higher order thinking skills"
     },
     {
      "text": "Gives opportunities for learners to show their creativity and innovative ideas"
     },
     {
      "text": "Gives opportunities for learners to propose solutions or suggestions addressing identified problems of the society"
     },
     {
      "text": "Gives opportunities for learners to gives opportunity for students to create/produce products and/or performances that demonstrate their learning and innovation skills using available resources"
     },
     {
      "text": "Gives opportunities for learners to perform roles that demonstrate their life and/or future career skills"
     },
     {
      "text": "Discusses goals for students’ learning aligned with most essential learning competencies, or learning/program outcomes."
     },
     {
      "text": "Evaluates the students’ progress and achievement using varied assessment methods"
     },
     {
      "text": "Makes himself/herself available to students,parents and/or other stakeholders during consultation"
     },
     {
      "text": "Provides effective and immediate feedback on student’s work during consultations."
     },
     {
      "text": "Uses assessment results to improve learning"
     },
     {
      "text": "Uses rubric to assess and evaluate the performance/output of students"
     },
     {
      "text": "Ensures the safety and security of learners"
     }
    ]
   },
   {
    "name": "Professional Commitment, Conduct and Deportment",
    "weight": 20,
    "items": [
     {
      "text": "Follows the design protocol in the formulation and preparation of the syllabus and other school/university documents"
     },
     {
      "text": "Prepares a well-written module, and other instructional materials"
     },
     {
      "text": "Aligns his/her strategies and assessments based on the designed syllabus for PC/AP and SH only"
     },
     {
      "text": "Submits office requirements on time"
     },
     {
      "text": "Records class assessments accurately"
     },
     {
      "text": "Updates licenses and applicable certifications and/or memberships in his/her aligned discipline"
     },
     {
      "text": "Attends punctually and regularly scheduled meetings"
     },
     {
      "text": "Attends departmental and institutional INSETs and/or required university events and occasions"
     },
     {
      "text": "Participates actively and collaboratively during meetings and school programs/activities"
     },
     {
      "text": "Attends seminars and trainings related to his/her discipline"
     }
    ]
   }
  ]
 },
 {
  "name": "Dean / Principal by the Faculty",
  "targetType": "DEAN",
  "group": "FAC",
  "dept": null,
  "variant": null,
  "categories": [
   {
    "name": "Planning, Supervision, Evaluation",
    "weight": 20,
    "items": [
     {
      "text": "Initiates the planning sessions for every school year"
     },
     {
      "text": "Encourages research endeavors for the improvement of instruction."
     },
     {
      "text": "Monitors curriculum review and revision."
     },
     {
      "text": "Suggests for the improvement of the syllabi and learning materials."
     },
     {
      "text": "Approves teachers’ test questions, and other assessment-related tools."
     },
     {
      "text": "Responds to problems/concerns and issues (that may arise) in a timely manner."
     },
     {
      "text": "Ensures compliance of teachers to school policies and regulations"
     },
     {
      "text": "Issues the teaching assignment/load of teachers in a timely manner."
     },
     {
      "text": "Ensures the professional development of the teachers."
     },
     {
      "text": "Conducts and facilitates regular faculty meetings."
     },
     {
      "text": "Discusses the status of the implementation of activities and programs in the school."
     },
     {
      "text": "Disseminates information coming from the different offices, and stakeholders."
     },
     {
      "text": "Conducts classroom observation, and gives feedback"
     }
    ]
   },
   {
    "name": "Teacher-Training/Development",
    "weight": 25,
    "items": [
     {
      "text": "Organizes faculty committees and supervises their functions."
     },
     {
      "text": "Evaluates performance of teachers’ consistent with school policies."
     },
     {
      "text": "Solicits inputs or suggestions from teachers for identification of training needs."
     },
     {
      "text": "Coordinates with concerned offices/agencies for the training needs of the instructors to improve job performance."
     },
     {
      "text": "Recommends teachers for appointment to certain positions based on sound judgment."
     }
    ]
   },
   {
    "name": "Communication Skills",
    "weight": 25,
    "items": [
     {
      "text": "Disseminates clearly the school policies, regulations and related matters to guide instructors in the performance of their duties and responsibilities."
     },
     {
      "text": "Disseminates punctually the updates on pertinent memos and circulars."
     },
     {
      "text": "Encourages teamwork in the accomplishment of departmental goals and objectives."
     },
     {
      "text": "Is visible and available to teachers, students for consultation and other related concerns."
     },
     {
      "text": "Listens to the suggestions of the faculty regarding the improvement of the school and/or the department."
     },
     {
      "text": "Facilitates sharing of knowledge and information"
     },
     {
      "text": "Initiates conference and/or dialogue with students and teachers when necessary."
     },
     {
      "text": "Handles confidential and sensitive matter professionally."
     }
    ]
   },
   {
    "name": "Motivational Skills",
    "weight": 30,
    "items": [
     {
      "text": "Demonstrates motivation of skills which allow a high possibility for achievement."
     },
     {
      "text": "Strongly advises teachers to pursue graduate studies for professional advancement."
     },
     {
      "text": "Ensures that teachers perform better."
     },
     {
      "text": "Taps teachers’ potentials."
     },
     {
      "text": "Commends teachers’ achievements and good performance."
     },
     {
      "text": "Rotates teaching assignments appropriately."
     }
    ]
   }
  ]
 },
 {
  "name": "Dean / Principal by the Faculty",
  "targetType": "DEAN",
  "group": "CHAIR",
  "dept": null,
  "variant": null,
  "categories": [
   {
    "name": "Planning, Supervision, Evaluation",
    "weight": 20,
    "items": [
     {
      "text": "Initiates the planning sessions for every school year"
     },
     {
      "text": "Encourages research endeavors for the improvement of instruction."
     },
     {
      "text": "Monitors curriculum review and revision."
     },
     {
      "text": "Suggests for the improvement of the syllabi and learning materials."
     },
     {
      "text": "Approves teachers’ test questions, and other assessment-related tools."
     },
     {
      "text": "Responds to problems/concerns and issues (that may arise) in a timely manner."
     },
     {
      "text": "Ensures compliance of teachers to school policies and regulations"
     },
     {
      "text": "Issues the teaching assignment/load of teachers in a timely manner."
     },
     {
      "text": "Ensures the professional development of the teachers."
     },
     {
      "text": "Conducts and facilitates regular faculty meetings."
     },
     {
      "text": "Discusses the status of the implementation of activities and programs in the school."
     },
     {
      "text": "Disseminates information coming from the different offices, and stakeholders."
     },
     {
      "text": "Conducts classroom observation, and gives feedback"
     }
    ]
   },
   {
    "name": "Teacher-Training/Development",
    "weight": 25,
    "items": [
     {
      "text": "Organizes faculty committees and supervises their functions."
     },
     {
      "text": "Evaluates performance of teachers’ consistent with school policies."
     },
     {
      "text": "Solicits inputs or suggestions from teachers for identification of training needs."
     },
     {
      "text": "Coordinates with concerned offices/agencies for the training needs of the instructors to improve job performance."
     },
     {
      "text": "Recommends teachers for appointment to certain positions based on sound judgment."
     }
    ]
   },
   {
    "name": "Communication Skills",
    "weight": 25,
    "items": [
     {
      "text": "Disseminates clearly the school policies, regulations and related matters to guide instructors in the performance of their duties and responsibilities."
     },
     {
      "text": "Disseminates punctually the updates on pertinent memos and circulars."
     },
     {
      "text": "Encourages teamwork in the accomplishment of departmental goals and objectives."
     },
     {
      "text": "Is visible and available to teachers, students for consultation and other related concerns."
     },
     {
      "text": "Listens to the suggestions of the faculty regarding the improvement of the school and/or the department."
     },
     {
      "text": "Facilitates sharing of knowledge and information"
     },
     {
      "text": "Initiates conference and/or dialogue with students and teachers when necessary."
     },
     {
      "text": "Handles confidential and sensitive matter professionally."
     }
    ]
   },
   {
    "name": "Motivational Skills",
    "weight": 30,
    "items": [
     {
      "text": "Demonstrates motivation of skills which allow a high possibility for achievement."
     },
     {
      "text": "Strongly advises teachers to pursue graduate studies for professional advancement."
     },
     {
      "text": "Ensures that teachers perform better."
     },
     {
      "text": "Taps teachers’ potentials."
     },
     {
      "text": "Commends teachers’ achievements and good performance."
     },
     {
      "text": "Rotates teaching assignments appropriately."
     }
    ]
   }
  ]
 },
 {
  "name": "Clinical Instructor in the Clinical Area (Hospital, Community Clinic) by the Nursing Students",
  "targetType": "CI",
  "group": "ST",
  "dept": null,
  "variant": null,
  "categories": [
   {
    "name": "Content knowledge and pedagogy",
    "weight": 35,
    "items": [
     {
      "text": "Demonstrates how we can document nursing care accurately."
     },
     {
      "text": "Integrates relevant principles of health sciences in nursing situations."
     },
     {
      "text": "Answers satisfactorily the questions raised about the activity."
     },
     {
      "text": "Summarizes concepts/theories/procedures briefly before we begin the laboratory activities."
     },
     {
      "text": "Integrates relevant research hospital findings when demonstrating nursing skills."
     },
     {
      "text": "Suggests learning materials that highlight the key theoretical/procedural/safety points of our activity."
     },
     {
      "text": "Establishes clearly the connection between our hospital duty practices and theoretical concepts."
     },
     {
      "text": "Gives comprehensive information on making our visits or rounds effective."
     },
     {
      "text": "Uses techniques that facilitate our comprehension of evidence-based practice in the delivery of care."
     },
     {
      "text": "Gives comprehensive tips on using participatory approach in evidence-based nursing care."
     },
     {
      "text": "Uses a good command of the English language in supervising"
     },
     {
      "text": "Integrates values in teaching the lesson or subject matter"
     }
    ]
   },
   {
    "name": "Management of the lesson",
    "weight": 20,
    "items": [
     {
      "text": "Organizes our patient care assignment in the clinical area before deployment."
     },
     {
      "text": "Closely supervises our performance of nursing procedures throughout the clinical rotation."
     },
     {
      "text": "Ensures that we adhere to the clinical rotation plan."
     },
     {
      "text": "Responds quickly to disruptive behavior during the clinical rotation."
     },
     {
      "text": "Ensures that we adhere to all rules and regulations in the clinical area."
     },
     {
      "text": "Ensures that we adhere to customer care standards."
     },
     {
      "text": "Ensures that we maintain proper documentation of rendered care."
     },
     {
      "text": "Provides opportunities for us to be involved in the carrying out of doctor’s orders and other nursing procedures."
     },
     {
      "text": "Provides opportunities for practicing leadership skills in the delivery of care."
     },
     {
      "text": "Provides opportunities for us to manage resources effectively."
     }
    ]
   },
   {
    "name": "Assessment of learners & learning environment",
    "weight": 35,
    "items": [
     {
      "text": "Asks questions that make me realize the importance of clinical duty practices."
     },
     {
      "text": "Communicates clearly the criteria used in grading my clinical case outputs."
     },
     {
      "text": "Returns my corrected clinical requirements on-time."
     },
     {
      "text": "Gives feedback about my performance."
     },
     {
      "text": "Allows me to collaborate with other students in accomplishing my clinical requirements."
     },
     {
      "text": "Gives me opportunities to demonstrate my skills in the practice of nursing."
     },
     {
      "text": "Conducts examinations that allow me to demonstrate my knowledge in delivering nursing care."
     },
     {
      "text": "Gives activities that allow me to communicate effectively with client."
     },
     {
      "text": "Gives assignments that allow me to enhance my skills in reporting nursing care accurately."
     },
     {
      "text": "Gives feedback of our performance in the clinical area for improvement of nursing skills."
     },
     {
      "text": "Helps us assess the implementation of our plan of care towards our client."
     }
    ]
   },
   {
    "name": "Research and Extension",
    "weight": 10,
    "items": [
     {
      "text": "Requires me to back up my report/output/statements/opinions through research findings or varied and reliable references"
     },
     {
      "text": "Encouraged me to participate in outreach and community extension activities/services"
     }
    ]
   }
  ]
 },
 {
  "name": "Clinical Instructor in the Skills Laboratory by the Nursing Students",
  "targetType": "CI",
  "group": "ST",
  "dept": null,
  "variant": "skills",
  "categories": [
   {
    "name": "Content knowledge and pedagogy",
    "weight": 35,
    "items": [
     {
      "text": "Demonstrates how clinical procedures are done before I perform the entire procedure."
     },
     {
      "text": "Answers satisfactorily the questions raised about the activity."
     },
     {
      "text": "Summarizes concepts/theories/procedures briefly before the class begins the laboratory activities."
     },
     {
      "text": "Integrates relevant research findings in her/his discussions."
     },
     {
      "text": "Gives learning materials that highlight the key theoretical/procedural/safety points of our activity."
     },
     {
      "text": "Establishes clearly the connection between my skills laboratory and theoretical concepts."
     },
     {
      "text": "Uses techniques that facilitate my comprehension of clinical procedures."
     },
     {
      "text": "Gives comprehensive tips on the use of participatory approach in evidence-based nursing care."
     },
     {
      "text": "Uses a good command of the English language in supervising"
     },
     {
      "text": "Integrates values in teaching the lesson or subject matter"
     }
    ]
   },
   {
    "name": "Management of the lesson and learning environment",
    "weight": 20,
    "items": [
     {
      "text": "Ensures that materials, supplies, and equipment are prepared before the class starts the tasks"
     },
     {
      "text": "Supervises closely the class performance of nursing procedures throughout the clinical rotation"
     },
     {
      "text": "Responds quickly to disruptive behavior during the laboratory period"
     },
     {
      "text": "Ensures that I adhere to all rules and regulations in the hospital"
     },
     {
      "text": "Ensures that I maintain proper documentation of patient care"
     },
     {
      "text": "Provides opportunities for me to engage in independent learning"
     },
     {
      "text": "Provides opportunities for practicing leadership skills in the hospital"
     },
     {
      "text": "Provides opportunities for me to manage resources effectively"
     },
     {
      "text": "Give me a comprehensive orientation on hospital procedures before deploying me in our duty areas"
     }
    ]
   },
   {
    "name": "Assessment of learners & learning environment",
    "weight": 35,
    "items": [
     {
      "text": "Asks questions that make me realize the importance of performing laboratory procedures"
     },
     {
      "text": "Communicates clearly the criteria used in grading my skills laboratory outputs"
     },
     {
      "text": "Returns my corrected laboratory requirements on-time"
     },
     {
      "text": "Gives feedback about my performance"
     },
     {
      "text": "Allows me to collaborate with other students in accomplishing my laboratory requirements"
     },
     {
      "text": "Gives me opportunities to demonstrate my skills in the practice of nursing"
     },
     {
      "text": "Conducts examinations that allow me to demonstrate my knowledge in clinical procedures"
     },
     {
      "text": "Gives activities that allow me to communicate effectively with patients"
     },
     {
      "text": "Gives activities that allow me to enhance my skills in clinical procedures"
     },
     {
      "text": "Gives us sufficient time to practice nursing procedures before calling for graded return demonstration"
     }
    ]
   },
   {
    "name": "Research and Extension",
    "weight": 10,
    "items": [
     {
      "text": "Requires me to back up my report/output/statements/opinions through research findings or varied and reliable references"
     },
     {
      "text": "Encouraged me to participate in outreach and community extension activities/services"
     }
    ]
   }
  ]
 },
 {
  "name": "Clinical Instructor in the Clinical Area by the Dean / Program Chair",
  "targetType": "CI",
  "group": "DEAN",
  "dept": null,
  "variant": null,
  "categories": [
   {
    "name": "Content knowledge and pedagogy",
    "weight": 35,
    "items": [
     {
      "text": "Demonstrates how students document nursing care accurately."
     },
     {
      "text": "Integrates relevant principles of health sciences in nursing situations."
     },
     {
      "text": "Answers satisfactorily the questions raised about the activity."
     },
     {
      "text": "Summarizes concepts/theories/procedures briefly before the class begin the clinical rotation."
     },
     {
      "text": "Integrates relevant research findings in her/his discussions."
     },
     {
      "text": "Gives learning materials that highlight the key theoretical/procedural/safety points of our activity."
     },
     {
      "text": "Establishes clearly the connection between students’ clinical rotation practices and theoretical concepts."
     },
     {
      "text": "Gives comprehensive information on making patients’ visits effective."
     },
     {
      "text": "Uses techniques that facilitate the comprehension of evidence-based practice in the delivery of care."
     },
     {
      "text": "Gives comprehensive tips on using participatory approach in evidence-based nursing care"
     },
     {
      "text": "Uses verbal and non-verbal communication strategies to support participation and engagement of duties"
     }
    ]
   },
   {
    "name": "Management of the lesson",
    "weight": 10,
    "items": [
     {
      "text": "Organizes patients' care assignment in the clinical rotation before deployment"
     },
     {
      "text": "Closely supervises the performance of nursing procedures throughout the clinical rotation"
     },
     {
      "text": "Ensures that we adhere to the clinical rotation plan"
     },
     {
      "text": "Responds quickly to disruptive behavior during the clinical rotation."
     },
     {
      "text": "Ensures that the student adhere to all rules and regulations in the clinical area"
     },
     {
      "text": "Ensures that the students adhere to costumer care standards"
     },
     {
      "text": "Ensures that the student maintain proper documentation of nursing care"
     },
     {
      "text": "Provides opportunities for students to be involved in the carrying out of doctor's orders and other nursing procedures"
     },
     {
      "text": "Provides opportunities for practicing leadership skills in the delivery of patients care."
     },
     {
      "text": "Provides opportunities for the students to manage resources effectively"
     }
    ]
   },
   {
    "name": "Assessment of learners & learning environment",
    "weight": 25,
    "items": [
     {
      "text": "Asks questions that make the students realize the importance of hospital duty practices"
     },
     {
      "text": "Communicates clearly the criteria used in grading the students clinical case outputs"
     },
     {
      "text": "Returns the students corrected clinical requirements on-time"
     },
     {
      "text": "Gives feedback about the students' performance."
     },
     {
      "text": "Allows students to collaborate with other students in accomplishing their clinical requirements."
     },
     {
      "text": "Gives students opportunities to demonstrate their skills in the practice of nursing"
     },
     {
      "text": "Conducts examinations that allow the students to demonstrate their knowledge in delivering nursing care"
     },
     {
      "text": "Gives activities that allows students to communicate effectively with the client and/or significant others"
     },
     {
      "text": "Gives assignment that allows students to enhance their skills in reporting patient care accurately"
     },
     {
      "text": "Gives feedback of the students' performance in the clinical rotation for improvement of nursing skills."
     },
     {
      "text": "Helps the students assess the implementation of their plan of care"
     }
    ]
   },
   {
    "name": "Professional Commitment, Conduct and Deportment",
    "weight": 10,
    "items": [
     {
      "text": "Sticks to required templates and formats in preparation of documents"
     },
     {
      "text": "Adheres to institutional dress code policy"
     },
     {
      "text": "Submits office requirements on time"
     },
     {
      "text": "Records class assessments accurately"
     },
     {
      "text": "Updates licenses and applicable certifications"
     },
     {
      "text": "Attends punctually and regularly scheduled meetings"
     },
     {
      "text": "Attends departmental and institutional INSETs and/or required university events and occasions"
     },
     {
      "text": "Participates actively and collaboratively during meetings and school programs/activities"
     },
     {
      "text": "Attends seminars and trainings related to his/her discipline"
     }
    ]
   },
   {
    "name": "Community Outreach/Extension",
    "weight": 5,
    "items": [
     {
      "text": "Community outreach/extension (per semester)",
      "levels": [
       "One program outreach/extension",
       "Two programs /one school outreach/extension",
       "Three programs/two school outreach/one university outreach",
       "More than three programs /more than two school/two or more university outreach"
      ]
     }
    ]
   },
   {
    "name": "Professional/Civic Linkages",
    "weight": 5,
    "items": [
     {
      "text": "Professional/civic linkages (per school year)",
      "levels": [
       "One local affiliation/membership",
       "One regional affiliation/membership",
       "One national affiliation/membership",
       "Officer in a professional organization/international organization member"
      ]
     }
    ]
   },
   {
    "name": "Professional Engagement",
    "weight": 10,
    "items": [
     {
      "text": "Participation in seminars, trainings, workshops and conferences (per semester)",
      "levels": [
       "In-house (program/school)",
       "One university/two in-house/one local/provincial",
       "Regional",
       "National/International"
      ]
     },
     {
      "text": "Involvement in a seminar, activity or event (per semester)",
      "levels": [
       "As member of working committee (legworks)",
       "As facilitator/moderator/consultant",
       "Judge/coach/trainer/speaker/co-organizer/emcee",
       "Organizer/coordinator/chairperson/activity or narrative report writer"
      ]
     },
     {
      "text": "Research involvement (per semester)",
      "levels": [
       "As respondent/facilitated data gathering",
       "Tool and ethics reviewer/format or language editor/consultant /mentor/participant",
       "Panel",
       "Adviser"
      ]
     }
    ]
   }
  ]
 },
 {
  "name": "Clinical Instructor in the Skills Laboratory by the Dean / Program Chair",
  "targetType": "CI",
  "group": "DEAN",
  "dept": null,
  "variant": "skills",
  "categories": [
   {
    "name": "Content knowledge and pedagogy",
    "weight": 35,
    "items": [
     {
      "text": "Demonstrates how clinical procedures are done before the class performs the entire procedure."
     },
     {
      "text": "Answers satisfactorily the questions raised about the activity."
     },
     {
      "text": "Summarizes concepts/theories/procedures briefly before the class begins the activity or nursing skill."
     },
     {
      "text": "Integrates relevant research findings in her/his discussions."
     },
     {
      "text": "Suggests learning materials that highlight the key theoretical/procedural/safety points of the class activity."
     },
     {
      "text": "Establishes clearly the connection between skills laboratory and theoretical concepts."
     },
     {
      "text": "Uses techniques that facilitate students’ comprehension of clinical procedures."
     },
     {
      "text": "Gives comprehensive tips on the use of participatory approach in evidence-based nursing care."
     },
     {
      "text": "Uses verbal and non-verbal communication strategies to support participation and engagement of students"
     }
    ]
   },
   {
    "name": "Management of the lesson",
    "weight": 10,
    "items": [
     {
      "text": "Ensures that materials, supplies, and equipment are prepared before the class starts the tasks"
     },
     {
      "text": "Supervises closely the performance of nursing procedures"
     },
     {
      "text": "Responds quickly to disruptive behavior during the laboratory period"
     },
     {
      "text": "Ensures that students adhere to all rules and regulations in the specified in the RLE"
     },
     {
      "text": "Provides opportunities for the students to engage in independent learning"
     },
     {
      "text": "Ensures orderliness and cleanliness in the environment"
     },
     {
      "text": "Ensures the safety and security in the environment"
     }
    ]
   },
   {
    "name": "Assessment of learners & learning environment",
    "weight": 25,
    "items": [
     {
      "text": "Asks questions that make students realize the importance of performing laboratory procedures"
     },
     {
      "text": "Communicates clearly the criteria used in grading the skills laboratory outputs"
     },
     {
      "text": "Returns corrected laboratory requirements on-time"
     },
     {
      "text": "Gives feedback about the students’ performance"
     },
     {
      "text": "Gives students opportunities to demonstrate nursing procedure being developed"
     },
     {
      "text": "Conducts examinations that allow students to demonstrate their knowledge in clinical procedures"
     },
     {
      "text": "Gives activities that allow the students to communicate effectively with patients"
     },
     {
      "text": "Gives activities that allow the students to enhance their skills in clinical procedures"
     },
     {
      "text": "Gives the class sufficient time to practice nursing procedures before calling for graded return demonstration"
     },
     {
      "text": "Encourages the students to ask questions"
     },
     {
      "text": "Uses rubric to asses and evaluate the performance/output of students"
     },
     {
      "text": "Makes himself/herself available to students during consultation hours to address laboratory concerns"
     },
     {
      "text": "Collects students’ portfolio/logbook"
     }
    ]
   },
   {
    "name": "Professional Commitment, Conduct and Deportment",
    "weight": 10,
    "items": [
     {
      "text": "Sticks to required templates and formats in preparation of documents"
     },
     {
      "text": "Adheres to institutional dress code policy"
     },
     {
      "text": "Submits office requirements on time"
     },
     {
      "text": "Records class assessments accurately"
     },
     {
      "text": "Updates licenses and applicable certifications"
     },
     {
      "text": "Attends punctually and regularly scheduled meetings"
     },
     {
      "text": "Attends departmental and institutional INSETs and/or required university events and occasions"
     },
     {
      "text": "Participates actively and collaboratively during meetings and school programs/activities"
     },
     {
      "text": "Attends seminars and trainings related to his/her discipline"
     }
    ]
   },
   {
    "name": "Community Outreach/Extension",
    "weight": 5,
    "items": [
     {
      "text": "Community outreach/extension (per semester)",
      "levels": [
       "One program outreach/extension",
       "Two programs /one school outreach/extension",
       "Three programs/two school outreach/one university outreach",
       "More than three programs /more than two school/two or more university outreach"
      ]
     }
    ]
   },
   {
    "name": "Professional/Civic Linkages",
    "weight": 5,
    "items": [
     {
      "text": "Professional/civic linkages (per school year)",
      "levels": [
       "One local affiliation/membership",
       "One regional affiliation/membership",
       "One national affiliation/membership",
       "Officer in a professional organization/international organization member"
      ]
     }
    ]
   },
   {
    "name": "Professional Engagement",
    "weight": 10,
    "items": [
     {
      "text": "Participation in seminars, trainings, workshops and conferences (per semester)",
      "levels": [
       "In-house (program/school)",
       "One university/two in-house/one local/provincial",
       "Regional",
       "National/International"
      ]
     },
     {
      "text": "Involvement in a seminar, activity or event (per semester)",
      "levels": [
       "As member of working committee (legworks)",
       "As facilitator/moderator/consultant",
       "Judge/coach/trainer/speaker/co-organizer/emcee",
       "Organizer/coordinator/chairperson/activity or narrative report writer"
      ]
     },
     {
      "text": "Research involvement (per semester)",
      "levels": [
       "As respondent/facilitated data gathering",
       "Tool and ethics reviewer/format or language editor/consultant /mentor/participant",
       "Panel",
       "Adviser"
      ]
     }
    ]
   }
  ]
 },
 {
  "name": "Office Staff by the Director / Dean / Principal",
  "targetType": "NTP_STAFF",
  "group": "NTPHEAD",
  "dept": null,
  "variant": null,
  "scale": "perf",
  "categories": [
   {
    "name": "Work performance",
    "weight": 50,
    "items": [
     {
      "text": "Attendance: the employee is reliable, arriving on time, maintaining regular attendance, properly reporting absences, and supporting smooth department operations.",
      "levels": [
       "12 and above valid absences / 3 and above days of invalid absences",
       "10-11 days of valid absences / 2 invalid absences",
       "8-9 valid absences / 2 invalid absences",
       "7 days and below valid absences, 0 invalid absence"
      ]
     },
     {
      "text": "Creativity: improves work through his/her innovative ideas."
     },
     {
      "text": "Dependability: works reliably and finishes tasks on time with little supervision."
     },
     {
      "text": "Job knowledge: performs tasks correctly by following set methods and job responsibilities, demonstrating a solid understanding of required principles, procedures, and the scope of their role."
     },
     {
      "text": "Judgement: assesses situations carefully and objectively and arrives at sound decisions."
     },
     {
      "text": "Management: effectively and efficiently oversees the end-to-end process(es) of the job functions delegated to him/her."
     },
     {
      "text": "Quality of work: accomplishes work thoroughly and produces quality output."
     },
     {
      "text": "Technical skills: has adequate technical skills to accomplish tasks."
     }
    ]
   },
   {
    "name": "Work behavior and attitude",
    "weight": 20,
    "items": [
     {
      "text": "Leadership: assumes the responsibility to take ownership of key processes, functions and problems which may arise from day-to-day operations."
     },
     {
      "text": "Organization: plans and organizes work effectively."
     },
     {
      "text": "Initiative: enhances work through his/her initiative and resourcefulness."
     },
     {
      "text": "Industry and diligence: willing to work beyond the given task."
     },
     {
      "text": "Objective judgment: thinks clearly and objectively in decision making in crucial situations."
     },
     {
      "text": "Decisiveness: uses available information to make decisions quickly."
     },
     {
      "text": "Promptness: completes work assignments or tasks on time."
     },
     {
      "text": "Emotional maturity: manifests emotional maturity at all times especially under stressful situations."
     },
     {
      "text": "Persistence: continues with determination to accomplish goals."
     },
     {
      "text": "Energy: displays endurance and capacity for fast paced tasks."
     },
     {
      "text": "Independence: self-reliant and self-directed in taking independent action."
     },
     {
      "text": "Manageability: follows policies, accepts external controls and supervision."
     },
     {
      "text": "Assertiveness: takes charge of people and situations."
     },
     {
      "text": "Cooperation: cooperates and supports colleagues and superiors."
     },
     {
      "text": "Concern: shows concern over the plight of other members of the office."
     },
     {
      "text": "Teamwork: works well with others."
     },
     {
      "text": "Sociability: outgoing, people-oriented and participates with others."
     },
     {
      "text": "Accommodating: friendly, cooperative, approachable."
     },
     {
      "text": "Concern for economy: observes careful and economical use of properties and supplies."
     },
     {
      "text": "Involvement: participates in University and departmental activities and meetings."
     }
    ]
   },
   {
    "name": "Deportment and bearing",
    "weight": 10,
    "items": [
     {
      "text": "General appearance and bearing: the employee maintains a professional appearance and behavior, upholds proper etiquette, dresses suitably, and positively reflects the department and University."
     }
    ]
   },
   {
    "name": "Professional growth",
    "weight": 15,
    "items": [
     {
      "text": "Readily participates in approved learning and development seminars, both within and outside the University."
     },
     {
      "text": "The employee is enrolled in a graduate or job-related program and shows strong commitment to professional growth."
     },
     {
      "text": "Membership in a professional/civic organization."
     },
     {
      "text": "Keeps oneself updated on current information/trends relevant to the job."
     }
    ]
   },
   {
    "name": "Involvement in community development",
    "weight": 5,
    "items": [
     {
      "text": "Engages in community efforts that support local development, with certification confirmed by the Director or Dean.",
      "levels": [
       "Did not participate in any community extension or outreach (0 activity)",
       "Participates sporadically, limited but visible involvement (1 activity)",
       "Regularly participates in community activities and contributes positively (2 activities)",
       "Actively participates in numerous community development programs; takes leadership or key roles (3 or more activities)"
      ]
     }
    ]
   }
  ]
 },
 {
  "name": "Director / Head of Office by the Office Staff",
  "targetType": "NTP_HEAD",
  "group": "NTPSTAFF",
  "dept": null,
  "variant": null,
  "scale": "perf",
  "categories": [
   {
    "name": "Management and work performance",
    "weight": 30,
    "items": [
     {
      "text": "Planning and execution: effectively plans and efficiently executes strategies to ensure smooth office operations and guaranteed success of projects and events."
     },
     {
      "text": "Operations management: effectively and efficiently oversees the department's overall operations and key processes."
     },
     {
      "text": "Decision making: makes timely and accurate decisions; takes risks based on collected facts."
     },
     {
      "text": "Leadership: manifests excellent leadership skills."
     },
     {
      "text": "Problem solving: manifests excellent problem solving skills in events of deviation from normal day-to-day office operations."
     },
     {
      "text": "Organization: clearly defines the departmental structure, authority and scope of work of each subordinate."
     },
     {
      "text": "Facilitation: conducts meetings and brainstorming sessions to address issues and to communicate management plans, decisions and actions."
     },
     {
      "text": "Communication and instruction: communicates clear-cut plans and courses of action to realize the University's Vision, Mission and Objectives; clearly communicates instructions, principles, and purpose of critical tasks."
     },
     {
      "text": "Asset and office management: manifests concern for economy; observes careful use of equipment and supplies; ensures that the department's assets are accurately accounted for; ensures cleanliness of the department."
     },
     {
      "text": "Personnel supervision: effectively and efficiently oversees the over-all performance of subordinates; effectively intervenes in the event of deviation from the University's goals and best practices."
     },
     {
      "text": "Delegation: ensures that each personnel is assigned equal share of tasks to avoid under and over loading and maximize his/her personnel's capabilities; gives the subordinate reasonable time to complete assignments."
     },
     {
      "text": "Job knowledge and competency: manifests exceptional knowledge and methods of the job."
     },
     {
      "text": "Diligence: regularly reports for work to monitor day-to-day office operations."
     }
    ]
   },
   {
    "name": "Personnel relations",
    "weight": 30,
    "items": [
     {
      "text": "Support: acknowledges and develops subordinates' strengths; familiar with subordinates' weaknesses and gives them room for self-improvement and self-actualization."
     },
     {
      "text": "Rapport: effectively builds rapport with subordinates, colleagues and superiors."
     },
     {
      "text": "Teamwork: works harmoniously and cooperatively with subordinates."
     },
     {
      "text": "Open mindedness: openness to subordinates' comments, ideas and suggestions for the improvement of the department's operations."
     },
     {
      "text": "Motivation: encourages subordinates; effectively lifts up employee confidence and morale."
     },
     {
      "text": "Objectivity: manifests control over personal feelings or personal motives; not biased and observes principles of equity."
     },
     {
      "text": "Career development: guides his/her subordinates in career planning; encourages his/her subordinates to take up trainings and courses for career advancement."
     },
     {
      "text": "Concern: shows concern over the plight of his/her subordinates."
     }
    ]
   },
   {
    "name": "Personal qualities",
    "weight": 20,
    "items": [
     {
      "text": "Creativity: introduces innovation and sustains realization to improve departmental operations."
     },
     {
      "text": "Initiative and resourcefulness: enhances work through his/her initiative and resourcefulness."
     },
     {
      "text": "Judgement: assesses situations carefully and objectively; flexible and dynamic decision making."
     },
     {
      "text": "Stability and composure: manifests tolerance to stress at all times and even under pressure."
     },
     {
      "text": "Professionalism: adheres to the best professional standards of the job; respects and observes confidentiality."
     },
     {
      "text": "Deportment and bearing: maintains professional appearance."
     },
     {
      "text": "Responsibility: assumes full responsibility over his/her own actions and decisions; also assumes full responsibility over the actions and decisions made by his/her subordinates."
     }
    ]
   },
   {
    "name": "Compliance with university thrusts",
    "weight": 20,
    "items": [
     {
      "text": "Dedication and loyalty to the University: adheres to and supports University objectives and policies."
     },
     {
      "text": "Professional growth and development: attends regional and national seminars and shares his/her newly acquired expertise to immediate subordinates by re-echoing the principles and methods learned."
     },
     {
      "text": "Involvement in University activities: shows volunteerism in planning and evaluation of University activities; more than willing to initiate programs."
     },
     {
      "text": "Realization of University vision, mission and objectives: sets appropriate strategic and action plans aligned to the University's vision, mission and objectives."
     },
     {
      "text": "Client relations: exhibits excellent customer relations."
     },
     {
      "text": "Concern for safety: does necessary steps to ensure the safety of everyone; always practices rules of safety and takes extra precaution to protect his/her own, the subordinates' and clients' well-being and the University's property."
     }
    ]
   }
  ]
 }
];
