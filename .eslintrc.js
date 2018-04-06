module.exports = {
  extends: ["eslint:recommended", "eslint-config-google"],
  parserOptions: {
    ecmaVersion: 8,
    sourceType: "module",
    ecmaFeatures: {
      experimentalObjectRestSpread: true
    }
  },
  env: {
    node: true
  },
  rules: {
    'comma-dangle': 'off',
    'arrow-parens': ['error', 'as-needed'],
    'indent': ['error', 2],
    'no-console': 'off'
  }
};
