const FlightInsurance = artifacts.require("FlightInsurance");

module.exports = function (deployer) {
  deployer.deploy(FlightInsurance);
};