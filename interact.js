const Web3 = require('web3');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

// Setup Web3 and connect to Ganache
const web3 = new Web3('http://127.0.0.1:8545');

// Read the contract ABI and bytecode
const contractJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'build/contracts/FlightInsurance.json'), 'utf8'));
const contractAbi = contractJson.abi;
const contractBytecode = contractJson.bytecode;

// Constants
const PREMIUM = web3.utils.toWei('0.1', 'ether');
const PAYOUT = web3.utils.toWei('1', 'ether');
const SUBSCRIPTION_DURATION = 30 * 24 * 60 * 60; // 30 days in seconds
const GAS_LIMIT = 300000; // Increased gas limit for transactions
const DELAY_THRESHOLD_HOURS = 2; // 2 hours threshold for payout

// Setup readline for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Helper function to print a formatted header
const printHeader = (title) => {
  console.log('\n' + '='.repeat(60));
  console.log(`  ${title}`);
  console.log('='.repeat(60));
};

// Helper function to print a formatted result
const printResult = (message) => {
  console.log('  >>> RESULT: ' + message);
  console.log('-'.repeat(60) + '\n');
};

// Helper function to clear the console (cross-platform)
const clearConsole = () => {
  process.stdout.write(process.platform === 'win32' ? '\x1Bc' : '\x1B[2J\x1B[3J\x1B[H');
};

// Helper function to prompt user input
const prompt = (question) => {
  return new Promise((resolve) => rl.question(question, resolve));
};

// Main interaction function
async function interact() {
  try {
    // Get accounts and label them
    const accounts = await web3.eth.getAccounts();
    const accountLabels = [];
    const roles = [];
    accounts.forEach((account, index) => {
      if (index === 0) {
        accountLabels.push(`Owner (${account})`);
        roles.push('Owner');
      } else if (index === 1) {
        accountLabels.push(`Oracle (${account})`);
        roles.push('Oracle');
      } else {
        accountLabels.push(`User ${index - 1} (${account})`);
        roles.push('User');
      }
    });

    // Deploy the contract and set the oracle
    printHeader("Deploying FlightInsurance Contract");
    const contract = new web3.eth.Contract(contractAbi);
    const deployedContract = await contract.deploy({ data: contractBytecode }).send({ from: accounts[0], gas: 5000000 });
    const instance = new web3.eth.Contract(contractAbi, deployedContract.options.address);
    console.log(`  Contract deployed at address: ${deployedContract.options.address}`);

    // Set the oracle (hardcoded as the second account)
    await instance.methods.setOracle(accounts[1]).send({ from: accounts[0], gas: GAS_LIMIT });
    printResult(`Oracle set to account: ${accounts[1]}`);

    // Deposit initial funds
    await instance.methods.depositFunds().send({ from: accounts[0], value: web3.utils.toWei('10', 'ether'), gas: GAS_LIMIT });
    printResult("10 ETH deposited to contract for payouts");

    // Top-level account selection loop
    while (true) {
      clearConsole(); // Clear console before showing account selection
      printHeader("Account Selection");
      console.log("  Choose an account to proceed:");
      accountLabels.forEach((label, index) => {
        console.log(`    ${index + 1}. ${label}`);
      });
      console.log(`    ${accountLabels.length + 1}. Exit`);

      const choice = parseInt(await prompt(`  Enter your choice (1-${accountLabels.length + 1}): `));
      if (choice === accountLabels.length + 1) {
        printHeader("Exiting Demo");
        console.log("  Thank you for exploring the FlightInsurance contract!");
        rl.close();
        process.exit(0);
      }
      if (choice < 1 || choice > accountLabels.length) {
        console.log("  Invalid choice. Please select a valid account.\n");
        continue;
      }

      const selectedAccount = accounts[choice - 1];
      const role = roles[choice - 1];

      // Role-specific command menus
      if (role === 'Owner') {
        while (true) {
          clearConsole(); // Clear console before showing Owner menu
          printHeader(`FlightInsurance Interactive Demo (Owner: ${selectedAccount})`);
          console.log("  Choose an action:");
          console.log("    1. Deposit funds to contract");
          console.log("    2. Check contract balance");
          console.log("    3. Switch account");
          console.log("    4. Exit");

          const ownerChoice = parseInt(await prompt("  Enter your choice (1-4): "));
          if (ownerChoice === 4) {
            printHeader("Exiting Demo");
            console.log("  Thank you for exploring the FlightInsurance contract!");
            rl.close();
            process.exit(0);
          }
          if (ownerChoice === 3) {
            break; // Switch account
          }

          if (ownerChoice === 1) {
            // Deposit funds
            printHeader("Deposit Funds to Contract");
            const amount = await prompt("  Enter amount to deposit (in ETH, e.g., 10): ");
            try {
              await instance.methods.depositFunds().send({ from: selectedAccount, value: web3.utils.toWei(amount, 'ether'), gas: GAS_LIMIT });
              printResult(`${amount} ETH deposited to contract for payouts`);
            } catch (error) {
              printResult(`Failed to deposit funds: ${error.message}`);
            }
            await prompt("Press Enter to continue..."); // Pause to view result

          } else if (ownerChoice === 2) {
            // Check contract balance
            printHeader("Check Contract Balance");
            const balance = await web3.eth.getBalance(instance.options.address);
            printResult(`Contract balance: ${web3.utils.fromWei(balance, 'ether')} ETH`);
            await prompt("Press Enter to continue..."); // Pause to view result

          } else {
            console.log("  Invalid choice. Please select a number between 1 and 4.\n");
            await prompt("Press Enter to continue..."); // Pause to view result
          }
        }

      } else if (role === 'Oracle') {
        while (true) {
          clearConsole(); // Clear console before showing Oracle menu
          printHeader(`FlightInsurance Interactive Demo (Oracle: ${selectedAccount})`);
          console.log("  Choose an action:");
          console.log("    1. Set flight delay and update status");
          console.log("    2. Check flight status");
          console.log("    3. Switch account");
          console.log("    4. Exit");

          const oracleChoice = parseInt(await prompt("  Enter your choice (1-4): "));
          if (oracleChoice === 4) {
            printHeader("Exiting Demo");
            console.log("  Thank you for exploring the FlightInsurance contract!");
            rl.close();
            process.exit(0);
          }
          if (oracleChoice === 3) {
            break; // Switch account
          }

          if (oracleChoice === 1) {
            // Set flight delay and update status
            printHeader("Set Flight Delay and Update Status");
            const flightID = await prompt("  Enter flight ID to update (e.g., FL123, FL456): ");
            const delayHours = parseFloat(await prompt("  Enter delay in hours (e.g., 1, 3): "));
            const delayed = (await prompt("  Is the flight delayed? (yes/no): ")).toLowerCase() === 'yes';
            const delaySeconds = delayHours * 60 * 60;

            await web3.currentProvider.send({
              jsonrpc: "2.0",
              method: "evm_increaseTime",
              params: [delaySeconds],
              id: new Date().getTime()
            }, () => {});
            await web3.currentProvider.send({
              jsonrpc: "2.0",
              method: "evm_mine",
              params: [],
              id: new Date().getTime()
            }, () => {});
            await web3.currentProvider.send({
              jsonrpc: "2.0",
              method: "evm_mine",
              params: [],
              id: new Date().getTime()
            }, () => {});

            try {
              const tx = await instance.methods.updateFlightStatus(flightID, delayed).send({ from: selectedAccount, gas: GAS_LIMIT });
              const receipt = await web3.eth.getTransactionReceipt(tx.transactionHash);
              for (const log of receipt.logs) {
                if (log.topics[0] === web3.utils.sha3('DebugTimestamps(address,string,uint256,uint256,uint256,bool)')) {
                  const decodedLog = web3.eth.abi.decodeLog([
                    { type: 'address', name: 'user', indexed: false },
                    { type: 'string', name: 'flightID', indexed: false },
                    { type: 'uint256', name: 'blockTimestamp', indexed: false },
                    { type: 'uint256', name: 'flightTimestamp', indexed: false },
                    { type: 'uint256', name: 'delayThreshold', indexed: false },
                    { type: 'bool', name: 'meetsDelayRequirement', indexed: false }
                  ], log.data, log.topics.slice(1));
                  console.log(`  Debug: user=${decodedLog.user}, flightID=${decodedLog.flightID}, blockTimestamp=${decodedLog.blockTimestamp}, flightTimestamp=${decodedLog.flightTimestamp}, delayThreshold=${decodedLog.delayThreshold}, meetsDelayRequirement=${decodedLog.meetsDelayRequirement}`);
                }
              }
              printResult(`Flight ${flightID} delay set to ${delayHours} hours, status updated to ${delayed ? 'Delayed' : 'Not Delayed'}`);
            } catch (error) {
              printResult(`Failed to update flight status: ${error.message}`);
            }
            await prompt("Press Enter to continue..."); // Pause to view result

          } else if (oracleChoice === 2) {
            // Check flight status (Oracle version)
            printHeader("Check Flight Status");
            const flightID = await prompt("  Enter flight ID to check (e.g., FL123, FL456): ");
            const delayed = await instance.methods.flightDelays(flightID).call();
            printResult(`Flight ${flightID} status: ${delayed ? 'Delayed' : 'Not Delayed'}`);
            await prompt("Press Enter to continue..."); // Pause to view result

          } else {
            console.log("  Invalid choice. Please select a number between 1 and 4.\n");
            await prompt("Press Enter to continue..."); // Pause to view result
          }
        }

      } else if (role === 'User') {
        while (true) {
          clearConsole(); // Clear console before showing User menu
          printHeader(`FlightInsurance Interactive Demo (User ${choice - 1}: ${selectedAccount})`);
          console.log("  Choose an action:");
          console.log("    1. Subscribe user (0.1 ETH)");
          console.log("    2. Register a flight");
          console.log("    3. Check subscription status");
          console.log("    4. Check flight status");
          console.log("    5. Check user balance");
          console.log("    6. Switch account");
          console.log("    7. Exit");

          const userChoice = parseInt(await prompt("  Enter your choice (1-7): "));
          if (userChoice === 7) {
            printHeader("Exiting Demo");
            console.log("  Thank you for exploring the FlightInsurance contract!");
            rl.close();
            process.exit(0);
          }
          if (userChoice === 6) {
            break; // Switch account
          }

          if (userChoice === 1) {
            // Subscribe user
            printHeader("Subscribe User");
            console.log("  Action: User pays 0.1 ETH to subscribe for 30 days.");
            try {
              await instance.methods.subscribe().send({ from: selectedAccount, value: PREMIUM, gas: GAS_LIMIT });
              const isSubscribed = await instance.methods.isSubscribed(selectedAccount).call();
              printResult(`User subscription status: ${isSubscribed ? 'Active' : 'Inactive'}`);
            } catch (error) {
              printResult(`Failed to subscribe: ${error.message}`);
            }
            await prompt("Press Enter to continue..."); // Pause to view result

          } else if (userChoice === 2) {
            // Register a flight
            printHeader("Register a Flight");
            const flightID = await prompt("  Enter flight ID (e.g., FL123, FL456): ");
            console.log(`  Action: User registers a flight (${flightID}).`);
            const currentTime = await web3.eth.getBlock('latest').then(block => block.timestamp);
            try {
              const tx = await instance.methods.registerFlight(flightID, currentTime).send({ from: selectedAccount, gas: GAS_LIMIT });
              await web3.eth.getTransactionReceipt(tx.transactionHash);
              const policyCount = await instance.methods.getPolicyCount(selectedAccount).call();
              printResult(`Number of flights registered: ${policyCount}`);
            } catch (error) {
              printResult(`Failed to register flight: ${error.message}`);
            }
            await prompt("Press Enter to continue..."); // Pause to view result

          } else if (userChoice === 3) {
            // Check subscription status
            printHeader("Check User Subscription Status");
            const isSubscribed = await instance.methods.isSubscribed(selectedAccount).call();
            printResult(`User subscription status: ${isSubscribed ? 'Active' : 'Inactive'}`);
            await prompt("Press Enter to continue..."); // Pause to view result

          } else if (userChoice === 4) {
            // Check flight status
            printHeader("Check Flight Status");
            const flightID = await prompt("  Enter flight ID to check (e.g., FL123, FL456): ");
            const policyCount = await instance.methods.getPolicyCount(selectedAccount).call();
            if (policyCount == 0) {
              printResult("No flights registered! Please choose option 2 to register a flight.");
              await prompt("Press Enter to continue..."); // Pause to view result
              continue;
            }

            const policies = await instance.methods.getUserPolicies(selectedAccount).call();
            const flightIDs = policies[0];
            const timestamps = policies[1];
            const paidOuts = policies[2];

            const delayed = await instance.methods.flightDelays(flightID).call();
            let totalDelay = 0;
            let index = -1;
            for (let i = 0; i < flightIDs.length; i++) {
              if (flightIDs[i] === flightID) {
                index = i;
                break;
              }
            }

            if (index === -1) {
              printResult(`Flight ${flightID} not found in your registered flights.`);
              await prompt("Press Enter to continue..."); // Pause to view result
              continue;
            }

            const currentTime = await web3.eth.getBlock('latest').then(block => block.timestamp);
            totalDelay = (currentTime - timestamps[index]) / (60 * 60); // Convert to hours
            const delayHours = totalDelay > 0 ? totalDelay : 0;
            const isSubscribed = await instance.methods.isSubscribed(selectedAccount).call();
            let balanceChange = "0";

            if (delayed && delayHours >= DELAY_THRESHOLD_HOURS && isSubscribed) {
              balanceChange = web3.utils.fromWei(PAYOUT, 'ether');
              printResult(`Flight ${flightID} is delayed by ${delayHours} hours.\n  User balance change: ${balanceChange} ETH\n  Note: A payout of 1 ETH was triggered because the flight was delayed by more than 2 hours.`);
            } else if (delayed && !isSubscribed && delayHours >= DELAY_THRESHOLD_HOURS) {
              printResult(`Flight ${flightID} is delayed by ${delayHours} hours.\n  User balance change: ${balanceChange} ETH\n  Note: Sorry, your flight is delayed. Subscribe for premium with 0.1 ETH and get 1 ETH next time your flight delays!`);
            } else {
              printResult(`Flight ${flightID} is delayed by ${delayHours} hours.\n  User balance change: ${balanceChange} ETH`);
            }
            await prompt("Press Enter to continue..."); // Pause to view result

          } else if (userChoice === 5) {
            // Check user balance
            printHeader("Check User Balance");
            const balance = await web3.eth.getBalance(selectedAccount);
            printResult(`User balance: ${web3.utils.fromWei(balance, 'ether')} ETH`);
            await prompt("Press Enter to continue..."); // Pause to view result

          } else {
            console.log("  Invalid choice. Please select a number between 1 and 7.\n");
            await prompt("Press Enter to continue..."); // Pause to view result
          }
        }
      }
    }

  } catch (error) {
    console.error("Error:", error.message);
    rl.close();
  }
}

// Start the interaction
interact();