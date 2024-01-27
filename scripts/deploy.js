// Import required libraries
const { ethers } = require("ethers");
const { utils } = require("ffjavascript");
const snarkjs = require("snarkjs");
const hardhat = require("hardhat");
const fs = require("fs");

// Base path for the circuit files
const BASE_PATH = "./circuits/circuit/";

// Helper function to convert number to hexadecimal BigNumber representation
function p256(n) {
  let nstr = n.toString(16);
  while (nstr.length < 64) nstr = "0" + nstr;
  nstr = "0x" + nstr;
  return ethers.BigNumber.from(nstr);
}

// Generate call data for the Verifier contract
async function generateCallData() {
  const zkProof = await generateProof();
  const proof = utils.unstringifyBigInts(zkProof.proof);
  const pub = utils.unstringifyBigInts(zkProof.publicSignals);

  let inputs = "";

  // Convert public inputs to hexadecimal BigNumber representation
  for (let i = 0; i < pub.length; i++) {
    if (inputs) inputs += ",";
    inputs += p256(pub[i]);
  }

  // Convert proof values to hexadecimal BigNumber representation
  const pi_a = [p256(proof.pi_a[0]), p256(proof.pi_a[1])];
  const pi_b = [
    [p256(proof.pi_b[0][1]), p256(proof.pi_b[0][0])],
    [p256(proof.pi_b[1][1]), p256(proof.pi_b[1][0])],
  ];
  const pi_c = [p256(proof.pi_c[0]), p256(proof.pi_c[1])];
  const input = [inputs];

  return { pi_a, pi_b, pi_c, input };
}

// Generate the proof using snarkjs library
async function generateProof() {
  const inputData = fs.readFileSync(BASE_PATH + "input.json", "utf8");
  const input = JSON.parse(inputData);

  // Calculate the witness for the circuit
  const out = await snarkjs.wtns.calculate(
    input,
    BASE_PATH + "out/circuit.wasm",
    BASE_PATH + "out/circuit.wtns"
  );

  // Generate the proof using the circuit witness and proving key
  const proof = await snarkjs.groth16.prove(
    BASE_PATH + "out/circuit.zkey",
    BASE_PATH + "out/circuit.wtns"
  );

  // Write the generated proof to a file
  fs.writeFileSync(BASE_PATH + "out/proof.json", JSON.stringify(proof, null, 1));

  return proof;
}

// Main function to deploy Verifier contract and verify the proof
async function main() {
  // Deploy the Verifier contract
  const Verifier = await hardhat.ethers.getContractFactory(
    "./contracts/Verifier.sol:Verifier"
  );
  const verifier = await Verifier.deploy();
  await verifier.deployed();
  console.log(`Verifier deployed to ${verifier.address}`);

  // Generate the call data
  const { pi_a, pi_b, pi_c, input } = await generateCallData();

  // Verify the proof using the Verifier contract
  const tx = await verifier.verifyProof(pi_a, pi_b, pi_c, input);
  console.log(`Verifier result is: ${tx}`);
  console.assert(tx == true, "Proof verification unsuccessful!");

  process.exit(0);
}

// Execute the main function and handle errors
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
