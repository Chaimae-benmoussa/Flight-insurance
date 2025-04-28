// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract FlightInsurance {
    address public insurer;
    address public oracle; // Address of the oracle
    uint256 public constant PREMIUM = 0.1 ether; // Monthly subscription premium
    uint256 public constant PAYOUT = 1 ether; // Payout for delayed flights
    uint256 public constant DELAY_THRESHOLD = 2 hours; // Delay threshold for payout
    uint256 public constant SUBSCRIPTION_DURATION = 30 days; // Subscription lasts 30 days

    struct Policy {
        string flightID;
        uint256 flightTimestamp;
        bool hasPaidOut;
    }

    struct Subscription {
        bool isActive;
        uint256 startTime;
        Policy[] policies; // Array of policies for this subscriber
    }

    mapping(address => Subscription) public subscriptions;
    mapping(string => bool) public flightDelays; // Tracks flight delay status
    address[] public allSubscribers; // Tracks all subscriber addresses

    // Modifier to restrict actions to the insurer
    modifier onlyInsurer() {
        require(msg.sender == insurer, "Only insurer can call this function");
        _;
    }

    // Modifier to restrict actions to the oracle
    modifier onlyOracle() {
        require(msg.sender == oracle, "Only oracle can call this function");
        _;
    }

    constructor() {
        insurer = msg.sender;
        oracle = msg.sender; // For testing, oracle is deployer; can be changed later
    }

    // Allow the insurer to set a new oracle address
    function setOracle(address _oracle) external onlyInsurer {
        require(_oracle != address(0), "Invalid oracle address");
        oracle = _oracle;
    }

    // Allow the insurer to deposit funds to cover payouts
    function depositFunds() external payable onlyInsurer {}

    // Subscribe by paying the monthly premium
    function subscribe() external payable {
        require(msg.value == PREMIUM, "Premium must be 0.1 ETH");
        require(!subscriptions[msg.sender].isActive, "Already subscribed");

        Subscription storage sub = subscriptions[msg.sender];
        sub.isActive = true;
        sub.startTime = block.timestamp;
        allSubscribers.push(msg.sender); // Add to subscribers list
    }

    // Register a flight under an active subscription
    function registerFlight(string memory flightID, uint256 flightTimestamp) external {
        Subscription storage sub = subscriptions[msg.sender];
        require(sub.isActive, "No active subscription");
        require(block.timestamp < sub.startTime + SUBSCRIPTION_DURATION, "Subscription expired");

        // Check if flightID is already registered for this user
        for (uint i = 0; i < sub.policies.length; i++) {
            require(keccak256(bytes(sub.policies[i].flightID)) != keccak256(bytes(flightID)), "Flight already registered");
        }

        sub.policies.push(Policy({
            flightID: flightID,
            flightTimestamp: flightTimestamp,
            hasPaidOut: false
        }));
    }

    // Oracle updates flight status and triggers payout if delayed
    function updateFlightStatus(string memory flightID, bool delayed) external onlyOracle {
        flightDelays[flightID] = delayed;

        if (delayed) {
            // Iterate through all subscribers
            for (uint i = 0; i < allSubscribers.length; i++) {
                address subscriber = allSubscribers[i];
                Subscription storage sub = subscriptions[subscriber];

                // Skip if subscription is expired
                if (block.timestamp >= sub.startTime + SUBSCRIPTION_DURATION) {
                    sub.isActive = false;
                    continue;
                }

                // Check each policy for this subscriber
                for (uint j = 0; j < sub.policies.length; j++) {
                    Policy storage policy = sub.policies[j];
                    if (
                        keccak256(bytes(policy.flightID)) == keccak256(bytes(flightID)) &&
                        !policy.hasPaidOut &&
                        block.timestamp >= policy.flightTimestamp + DELAY_THRESHOLD
                    ) {
                        policy.hasPaidOut = true;
                        payable(subscriber).transfer(PAYOUT);
                    }
                }
            }
        }
    }

    // Check contract balance
    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    // Check if a subscription is active
    function isSubscribed(address user) external view returns (bool) {
        Subscription storage sub = subscriptions[user];
        return sub.isActive && block.timestamp < sub.startTime + SUBSCRIPTION_DURATION;
    }
}