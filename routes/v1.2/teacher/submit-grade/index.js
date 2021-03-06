const express = require("express");
const router = express.Router();
const { authen, author } = require("../../acc/protect-middleware");
const { ROLE } = require("../../acc/role");
const connection = require("../../../../db");
const axios = require("axios").default;
const ObjectID = require("mongodb").ObjectID;
const { encrypt } = require("eciesjs");
const { hashObject, randomTxid } = require("../../../utils");

// router.post("/save-draff", authen, author(ROLE.TEACHER), async (req, res) => {
//   try {
//     const teacherColl = (await connection).db().collection("TeacherHistory");
//     const doc = await teacherColl.findOne({ "profiles.uid": new ObjectID(req.user.uid) }, { projection: { "profiles.$": 1, _id: 0 } });
//     const teacherProfile = doc.profiles[0];
//     const claxx = req.body.claxx;
//     const classColl = (await connection).db().collection("Class");
//     const opReuslt = await classColl.updateOne(
//       { teacherId: teacherProfile.teacherId, classId: claxx.classId },
//       { $set: { students: claxx.students } }
//     );
//     return res.json(opReuslt);
//   } catch (error) {
//     console.error(error);
//     return res.status(500).send(error);
//   }
// });

router.post("/submit-grade", authen, author(ROLE.TEACHER), async (req, res) => {
  try {
    const classCol = (await connection).db().collection("Class");
    const privateKeyHex = req.body.privateKeyHex;
    const claxx = req.body.claxx;
    console.log("🚧 --> router.post --> claxx", claxx);

    // require teacher != null
    const payload = preparePayload(privateKeyHex, claxx);
    console.log("🚧 --> router.post --> payload", payload);
    try {
      const response = await axios.post("/teacher/submit-grade", payload);
      claxx.students.forEach((student) => (student.txid = findTxid(response.data.transactions, student.publicKey)));
      claxx.students.forEach((student) => (student.timestamp = Date.now()));
      await classCol.updateOne({ classId: claxx.classId }, { $set: { students: claxx.students, isSubmited: true } });
      claxx.isSubmited = true;
      return res.json(claxx); // front-end need txid, isSubmited
    } catch (error) {
      console.error(error);
      if (error.response) return res.status(502).send(error.response.data);
      return res.status(502).send(error.toString());
    }
  } catch (error) {
    console.error(error);
    return res.status(500).send(error.toString());
  }
});

function preparePayload(privateKeyHex, claxx) {
  const grades = claxx.students.map((student) => {
    const plain = {
      classGroup: claxx.classGroup,
      nameOfClass: claxx.nameOfClass,
      classId: claxx.classId,
      teacherId: claxx.teacher.teacherId,
      teacherName: claxx.teacher.name,
      studentName: student.name,
      math: student.math,
      literacy: student.literacy,
      language: student.language,
      naturalNsocial: student.naturalNsocial,
      historyNgeography: student.historyNgeography,
      science: student.science,
      itNtech: student.itNtech,
      healthEdu: student.healthEdu,
      art: student.art,
    };
    const cipher = encrypt(student.publicKey, Buffer.from(JSON.stringify(plain))).toString("hex");
    const hash = hashObject(plain);
    return { studentPublicKey: student.publicKey, eduProgramId: student.eduProgram.eduProgramId, cipher, hash };
  });
  return { privateKeyHex, universityPublicKey: claxx.teacher.universityPublicKey, classId: claxx.classId, grades };
}

function findTxid(txs, publicKey) {
  return txs.find((tx) => tx.studentPublicKey === publicKey).transactionId;
}

module.exports = router;
