const FlightInsurance = artifacts.require("FlightInsurance");
const { time, expectRevert, balance } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');

contract("FlightInsurance", accounts => {
  const user = accounts[1];
  const oracle = accounts[2];
  const PREMIUM = web3.utils.toWei('0.1', 'ether');
  const PAYOUT = web3.utils.toWei('1', 'ether');
  const DELAY_THRESHOLD = 2 * 60 * 60; // 2 hours in seconds
  const SUBSCRIPTION_DURATION = 30 * 24 * 60 * 60; // 30 days in seconds

  let instance;

  beforeEach(async () => {
    instance = await FlightInsurance.new({ from: accounts[0] });
    await instance.setOracle(oracle, { from: accounts[0] });
    await instance.depositFunds({ from: accounts[0], value: web3.utils.toWei('10', 'ether') });
  });

  // Helper function to print a formatted header
  const printHeader = (title) => {
    console.log('\n' + '='.repeat(60));
    console.log(`  TEST: ${title}`);
    console.log('='.repeat(60));
  };

  // Helper function to print a formatted result
  const printResult = (message) => {
    console.log('  >>> RESULT: ' + message);
    console.log('-'.repeat(60) + '\n');
  };

  it("should allow user to subscribe", async () => {
    printHeader("Allow User to Subscribe");
    console.log("  Purpose: Verify that a user can subscribe by paying 0.1 ETH.");
    console.log("  Steps:");
    console.log("    1. User sends 0.1 ETH to subscribe.");
    console.log("    2. Check if subscription is active and start time is set.");

    await instance.subscribe({ from: user, value: PREMIUM });
    const isSubscribed = await instance.isSubscribed(user);

    printResult(`User subscription status: ${isSubscribed ? 'Active' : 'Inactive'}`);
    expect(isSubscribed).to.be.true;
  });

  it("should reject subscription if incorrect premium", async () => {
    printHeader("Reject Subscription if Incorrect Premium");
    console.log("  Purpose: Ensure the contract rejects subscriptions with incorrect payment.");
    console.log("  Steps:");
    console.log("    1. User sends 0.05 ETH (incorrect premium).");
    console.log("    2. Verify the transaction reverts.");

    const incorrectPremium = web3.utils.toWei('0.05', 'ether');
    try {
      await instance.subscribe({ from: user, value: incorrectPremium });
      expect.fail("Transaction should have reverted");
    } catch (error) {
      printResult("Transaction reverted as expected due to incorrect premium.");
      expect(error.message).to.include("Premium must be 0.1 ETH");
    }
  });

  it("should allow user to register a flight with active subscription", async () => {
    printHeader("Allow User to Register a Flight with Active Subscription");
    console.log("  Purpose: Confirm that a subscribed user can register a flight.");
    console.log("  Steps:");
    console.log("    1. User subscribes with 0.1 ETH.");
    console.log("    2. User registers a flight (FL123).");
    console.log("    3. Verify the flight is added to the user's policies.");

    await instance.subscribe({ from: user, value: PREMIUM });
    const flightID = "FL123";
    const flightTimestamp = (await time.latest()).toNumber();
    await instance.registerFlight(flightID, flightTimestamp, { from: user });

    const subscription = await instance.subscriptions(user);
    const policyCount = subscription.policies.length;

    printResult(`Number of flights registered: ${policyCount}`);
    expect(policyCount).to.equal(1);
  });

  it("should reject flight registration without subscription", async () => {
    printHeader("Reject Flight Registration Without Subscription");
    console.log("  Purpose: Ensure the contract rejects flight registration if the user isn't subscribed.");
    console.log("  Steps:");
    console.log("    1. User tries to register a flight without subscribing.");
    console.log("    2. Verify the transaction reverts.");

    const flightID = "FL123";
    const flightTimestamp = (await time.latest()).toNumber();
    try {
      await instance.registerFlight(flightID, flightTimestamp, { from: user });
      expect.fail("Transaction should have reverted");
    } catch (error) {
      printResult("Transaction reverted as expected due to no active subscription.");
      expect(error.message).to.include("No active subscription");
    }
  });

  it("should automatically pay out for delayed flight", async () => {
    printHeader("Automatically Pay Out for Delayed Flight");
    console.log("  Purpose: Verify that the contract pays out 1 ETH for a delayed flight.");
    console.log("  Steps:");
    console.log("    1. User subscribes with 0.1 ETH.");
    console.log("    2. User registers a flight (FL123).");
    console.log("    3. Advance time to simulate a delay of over 2 hours.");
    console.log("    4. Oracle marks the flight as delayed.");
    console.log("    5. Check if the user received 1 ETH payout.");

    await instance.subscribe({ from: user, value: PREMIUM });
    const flightID = "FL123";
    const flightTimestamp = (await time.latest()).toNumber();
    await instance.registerFlight(flightID, flightTimestamp, { from: user });

    const balanceBefore = await balance.current(user);
    await time.increase(DELAY_THRESHOLD + 1); // Delay > 2 hours
    await instance.updateFlightStatus(flightID, true, { from: oracle });
    const balanceAfter = await balance.current(user);

    const payoutReceived = balanceAfter.sub(balanceBefore).toString();
    printResult(`User received payout: ${web3.utils.fromWei(payoutReceived, 'ether')} ETH`);
    expect(payoutReceived).to.equal(PAYOUT);
  });

  it("should not pay out if flight is not delayed", async () => {
    printHeader("Not Pay Out if Flight is Not Delayed");
    console.log("  Purpose: Ensure no payout occurs if the flight is not delayed.");
    console.log("  Steps:");
    console.log("    1. User subscribes with 0.1 ETH.");
    console.log("    2. User registers a flight (FL123).");
    console.log("    3. Advance time to simulate a delay of over 2 hours.");
    console.log("    4. Oracle marks the flight as not delayed.");
    console.log("    5. Check if the user's balance remains unchanged.");

    await instance.subscribe({ from: user, value: PREMIUM });
    const flightID = "FL123";
    const flightTimestamp = (await time.latest()).toNumber();
    await instance.registerFlight(flightID, flightTimestamp, { from: user });

    const balanceBefore = await balance.current(user);
    await time.increase(DELAY_THRESHOLD + 1);
    await instance.updateFlightStatus(flightID, false, { from: oracle });
    const balanceAfter = await balance.current(user);

    const balanceChange = balanceAfter.sub(balanceBefore).toString();
    printResult(`User balance change: ${web3.utils.fromWei(balanceChange, 'ether')} ETH (no payout expected)`);
    expect(balanceChange).to.equal('0');
  });

  it("should not pay out if delay threshold not met", async () => {
    printHeader("Not Pay Out if Delay Threshold Not Met");
    console.log("  Purpose: Ensure no payout occurs if the delay is less than 2 hours.");
    console.log("  Steps:");
    console.log("    1. User subscribes with 0.1 ETH.");
    console.log("    2. User registers a flight (FL123).");
    console.log("    3. Advance time to simulate a delay of 1 hour (less than threshold).");
    console.log("    4. Oracle marks the flight as delayed.");
    console.log("    5. Check if the user's balance remains unchanged.");

    await instance.subscribe({ from: user, value: PREMIUM });
    const flightID = "FL123";
    const flightTimestamp = (await time.latest()).toNumber();
    await instance.registerFlight(flightID, flightTimestamp, { from: user });

    const balanceBefore = await balance.current(user);
    await time.increase(DELAY_THRESHOLD - 3600); // Delay of 1 hour
    await instance.updateFlightStatus(flightID, true, { from: oracle });
    const balanceAfter = await balance.current(user);

    const balanceChange = balanceAfter.sub(balanceBefore).toString();
    printResult(`User balance change: ${web3.utils.fromWei(balanceChange, 'ether')} ETH (no payout expected)`);
    expect(balanceChange).to.equal('0');
  });
});