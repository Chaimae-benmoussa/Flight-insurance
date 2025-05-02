// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract FlightInsurance {
    address public oracle;
    address public owner;

    uint256 constant PREMIUM = 0.1 ether;
    uint256 constant PAYOUT = 1 ether;
    uint256 constant DELAY_THRESHOLD = 2 hours;
    uint256 constant SUBSCRIPTION_DURATION = 30 days;

    struct Policy {
        string flightID;
        uint256 flightTimestamp;
        bool hasPaidOut;
    }

    struct Subscription {
        bool isActive;
        uint256 startTime;
        Policy[] policies;
    }

    mapping(address => Subscription) public subscriptions;
    mapping(string => bool) public flightDelays;
    address[] public allSubscribers;
    address[] public allUsersWithFlights;

    // Debug event
    event DebugTimestamps(
        address user,
        string flightID,
        uint256 blockTimestamp,
        uint256 flightTimestamp,
        uint256 delayThreshold,
        bool meetsDelayRequirement
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }

    modifier onlyOracle() {
        require(msg.sender == oracle, "Only oracle can call this function");
        _;
    }

    modifier notOracle() {
        require(msg.sender != oracle, "Oracle cannot perform this action");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function setOracle(address _oracle) external onlyOwner {
        oracle = _oracle;
    }

    function depositFunds() external payable onlyOwner {
        require(msg.value > 0, "Must deposit some ETH");
    }

    function subscribe() external payable {
        require(msg.value == PREMIUM, "Premium must be 0.1 ETH");
        require(!subscriptions[msg.sender].isActive, "Already subscribed");

        Subscription storage sub = subscriptions[msg.sender];
        sub.isActive = true;
        sub.startTime = block.timestamp;

        bool userExists = false;
        for (uint i = 0; i < allSubscribers.length; i++) {
            if (allSubscribers[i] == msg.sender) {
                userExists = true;
                break;
            }
        }
        if (!userExists) {
            allSubscribers.push(msg.sender);
        }

        userExists = false;
        for (uint i = 0; i < allUsersWithFlights.length; i++) {
            if (allUsersWithFlights[i] == msg.sender) {
                userExists = true;
                break;
            }
        }
        if (!userExists) {
            allUsersWithFlights.push(msg.sender);
        }
    }

    function registerFlight(string memory flightID, uint256 flightTimestamp) external notOracle {
        Subscription storage sub = subscriptions[msg.sender];

        for (uint i = 0; i < sub.policies.length; i++) {
            require(keccak256(bytes(sub.policies[i].flightID)) != keccak256(bytes(flightID)), "Flight already registered");
        }

        sub.policies.push(Policy({
            flightID: flightID,
            flightTimestamp: flightTimestamp,
            hasPaidOut: false
        }));

        bool userExists = false;
        for (uint i = 0; i < allUsersWithFlights.length; i++) {
            if (allUsersWithFlights[i] == msg.sender) {
                userExists = true;
                break;
            }
        }
        if (!userExists) {
            allUsersWithFlights.push(msg.sender);
        }
    }

    function updateFlightStatus(string memory flightID, bool delayed) external onlyOracle {
        flightDelays[flightID] = delayed;
        if (delayed) {
            for (uint i = 0; i < allUsersWithFlights.length; i++) {
                address user = allUsersWithFlights[i];
                Subscription storage sub = subscriptions[user];
                
                bool isActive = sub.isActive && (block.timestamp < sub.startTime + SUBSCRIPTION_DURATION);
                if (sub.isActive && !isActive) {
                    sub.isActive = false;
                }

                for (uint j = 0; j < sub.policies.length; j++) {
                    Policy storage policy = sub.policies[j];
                    bool meetsDelay = block.timestamp >= policy.flightTimestamp + DELAY_THRESHOLD;
                    emit DebugTimestamps(
                        user,
                        flightID,
                        block.timestamp,
                        policy.flightTimestamp,
                        DELAY_THRESHOLD,
                        meetsDelay
                    );
                    if (
                        keccak256(bytes(policy.flightID)) == keccak256(bytes(flightID)) &&
                        !policy.hasPaidOut &&
                        meetsDelay
                    ) {
                        if (isActive) {
                            policy.hasPaidOut = true;
                            payable(user).transfer(PAYOUT);
                        }
                    }
                }
            }
        }
    }

    function isSubscribed(address user) external view returns (bool) {
        Subscription storage sub = subscriptions[user];
        return sub.isActive && block.timestamp < sub.startTime + SUBSCRIPTION_DURATION;
    }

    function getPolicyCount(address user) external view returns (uint256) {
        return subscriptions[user].policies.length;
    }

    function getUserPolicies(address user) external view returns (string[] memory, uint256[] memory, bool[] memory) {
        Subscription storage sub = subscriptions[user];
        string[] memory flightIDs = new string[](sub.policies.length);
        uint256[] memory timestamps = new uint256[](sub.policies.length);
        bool[] memory paidOuts = new bool[](sub.policies.length);

        for (uint i = 0; i < sub.policies.length; i++) {
            flightIDs[i] = sub.policies[i].flightID;
            timestamps[i] = sub.policies[i].flightTimestamp;
            paidOuts[i] = sub.policies[i].hasPaidOut;
        }
        return (flightIDs, timestamps, paidOuts);
    }
}