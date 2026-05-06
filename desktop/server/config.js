let _userDataPath = null;

function setUserDataPath(p) {
  _userDataPath = p;
}

function getUserDataPath() {
  if (!_userDataPath) throw new Error("userDataPath not set. Call setUserDataPath first.");
  return _userDataPath;
}

module.exports = { setUserDataPath, getUserDataPath };
