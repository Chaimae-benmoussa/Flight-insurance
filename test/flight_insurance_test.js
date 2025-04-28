const FlightInsurance = artifacts.require("FlightInsurance");
const { expectRevert, time } = require('@openzeppelin/test-helpers');
const { web3 } = FlightInsurance;

contract("FlightInsurance", accounts => {
    let flightInsurance;
    const insurer = accounts[0];
    const user = accounts[1];
    const oracle = accounts[2];
    const PREMIUM = web3.utils.toWei("0.1", "ether");
    const PAYOUT = web3.utils.toWei("1", "ether");
    const DELAY_THRESHOLD = 2 * 60 * 60; // 2 hours in seconds
    const flightID = "FL123";

    beforeEach(async () => {
        flightInsurance = await FlightInsurance.new({ from: insurer });
        await flightInsurance.setOracle(oracle, { from: insurer });
        await flightInsurance.depositFunds({ from: insurer, value: web3.utils.toWei("10", "ether") });
    });

    it("should allow user to subscribe", async () => {
        await flightInsurance.subscribe({ from: user, value: PREMIUM });
        const isSubscribed = await flightInsurance.isSubscribed(user);
        assert.equal(isSubscribed, true, "User should be subscribed");
    });

    it("should reject subscription if incorrect premium", async () => {
        await expectRevert(
            flightInsurance.subscribe({ from: user, value: web3.utils.toWei("0.05", "ether") }),
            "Premium must be 0.1 ETH"
        );
    });

    it("should allow user to register a flight with active subscription", async () => {
        await flightInsurance.subscribe({ from: user, value: PREMIUM });
        const flightTimestamp = (await time.latest()).toNumber() + 3600; // 1 hour from now
        await flightInsurance.registerFlight(flightID, flightTimestamp, { from: user });
        const isSubscribed = await flightInsurance.isSubscribed(user);
        assert.equal(isSubscribed, true, "User should remain subscribed");
    });

    it("should reject flight registration without subscription", async () => {
        const flightTimestamp = (await time.latest()).toNumber() + 3600;
        await expectRevert(
            flightInsurance.registerFlight(flightID, flightTimestamp, { from: user }),
            "No active subscription"
        );
    });

    it("should automatically pay out for delayed flight", async () => {
        // Subscribe and register flight
        await flightInsurance.subscribe({ from: user, value: PREMIUM });
        const flightTimestamp = (await time.latest()).toNumber();
        await flightInsurance.registerFlight(flightID, flightTimestamp, { from: user });

        // Advance time past delay threshold
        await time.increaseTo(flightTimestamp + DELAY_THRESHOLD + 100);

        // Oracle marks flight as delayed
        const initialBalance = BigInt(await web3.eth.getBalance(user));
        await flightInsurance.updateFlightStatus(flightID, true, { from: oracle });
        const finalBalance = BigInt(await web3.eth.getBalance(user));

        assert(finalBalance > initialBalance, "User should receive payout");
        const payoutReceived = finalBalance - initialBalance;
        assert(payoutReceived >= BigInt(PAYOUT), "Payout should be at least 1 ETH");
    });

    it("should not pay out if flight is not delayed", async () => {
        // Subscribe and register flight
        await flightInsurance.subscribe({ from: user, value: PREMIUM });
        const flightTimestamp = (await time.latest()).toNumber();
        await flightInsurance.registerFlight(flightID, flightTimestamp, { from: user });

        // Advance time past delay threshold
        await time.increaseTo(flightTimestamp + DELAY_THRESHOLD + 100);

        // Oracle marks flight as not delayed
        const initialBalance = BigInt(await web3.eth.getBalance(user));
        await flightInsurance.updateFlightStatus(flightID, false, { from: oracle });
        const finalBalance = BigInt(await web3.eth.getBalance(user));

        assert.equal(finalBalance, initialBalance, "No payout should occur");
    });

    it("should not pay out if delay threshold not met", async () => {
        // Subscribe and register flight
        await flightInsurance.subscribe({ from: user, value: PREMIUM });
        const flightTimestamp = (await time.latest()).toNumber();
        await flightInsurance.registerFlight(flightID, flightTimestamp, { from: user });

        // Advance time to just before threshold
        await time.increaseTo(flightTimestamp + DELAY_THRESHOLD - 100);

        // Oracle marks flight as delayed
        const initialBalance = BigInt(await web3.eth.getBalance(user));
        await flightInsurance.updateFlightStatus(flightID, true, { from: oracle });
        const finalBalance = BigInt(await web3.eth.getBalance(user));

        assert.equal(finalBalance, initialBalance, "No payout should occur before threshold");
    });
});