// [assignment] please copy the entire modified custom.test.js here
const hre = require('hardhat')
const { ethers, waffle } = hre
const { loadFixture } = waffle
const { expect } = require('chai')
const { utils } = ethers

const Utxo = require('../src/utxo')
const { transaction, registerAndTransact, prepareTransaction, buildMerkleTree } = require('../src/index')
const { toFixedHex, poseidonHash } = require('../src/utils')
const { Keypair } = require('../src/keypair')
const { encodeDataForBridge } = require('./utils')

const MERKLE_TREE_HEIGHT = 5
const l1ChainId = 1
const MINIMUM_WITHDRAWAL_AMOUNT = utils.parseEther(process.env.MINIMUM_WITHDRAWAL_AMOUNT || '0.05')
const MAXIMUM_DEPOSIT_AMOUNT = utils.parseEther(process.env.MAXIMUM_DEPOSIT_AMOUNT || '1')

describe('Custom Tests', function () {
  this.timeout(20000)

  async function deploy(contractName, ...args) {
    const Factory = await ethers.getContractFactory(contractName)
    const instance = await Factory.deploy(...args)
    return instance.deployed()
  }

  async function fixture() {
    require('../scripts/compileHasher')
    const [sender, gov, l1Unwrapper, multisig] = await ethers.getSigners()
    const verifier2 = await deploy('Verifier2')
    const verifier16 = await deploy('Verifier16')
    const hasher = await deploy('Hasher')

    const token = await deploy('PermittableToken', 'Wrapped ETH', 'WETH', 18, l1ChainId)
    await token.mint(sender.address, utils.parseEther('10000'))

    const amb = await deploy('MockAMB', gov.address, l1ChainId)
    const omniBridge = await deploy('MockOmniBridge', amb.address)

    /** @type {TornadoPool} */
    const tornadoPoolImpl = await deploy(
      'TornadoPool',
      verifier2.address,
      verifier16.address,
      MERKLE_TREE_HEIGHT,
      hasher.address,
      token.address,
      omniBridge.address,
      l1Unwrapper.address,
      gov.address,
      l1ChainId,
      multisig.address,
    )

    const { data } = await tornadoPoolImpl.populateTransaction.initialize(
      MINIMUM_WITHDRAWAL_AMOUNT,
      MAXIMUM_DEPOSIT_AMOUNT,
    )
    const proxy = await deploy(
      'CrossChainUpgradeableProxy',
      tornadoPoolImpl.address,
      gov.address,
      data,
      amb.address,
      l1ChainId,
    )

    const tornadoPool = tornadoPoolImpl.attach(proxy.address)

    await token.approve(tornadoPool.address, utils.parseEther('10000'))

    return { tornadoPool, token, proxy, omniBridge, amb, gov, multisig }
  }

  it('[assignment] ii. deposit 0.1 ETH in L1 -> withdraw 0.08 ETH in L2 -> assert balances', async () => {
    // [assignment] complete code here
    const { tornadoPool, token, omniBridge } = await loadFixture(fixture)

    const aliceWallet = ethers.Wallet.createRandom()
    const aliceKeypair = new Keypair()

    // Alice deposits 0.1 ETH in L1
    const aliceDepositAmount = utils.parseEther('0.1')
    const aliceDepositUtxo = new Utxo({
      amount: aliceDepositAmount,
      keypair: aliceKeypair,
    })
    const { args, extData } = await prepareTransaction({
      tornadoPool,
      outputs: [aliceDepositUtxo],
    })
    const onTokenBridgedData = encodeDataForBridge({
      proof: args,
      extData,
    })
    const onTokenBridgedTx = await tornadoPool.populateTransaction.onTokenBridged(
      token.address,
      aliceDepositUtxo.amount,
      onTokenBridgedData,
    )
    await token.transfer(omniBridge.address, aliceDepositAmount)
    const transferTx = await token.populateTransaction.transfer(tornadoPool.address, aliceDepositAmount)
    await omniBridge.execute([
      { who: token.address, callData: transferTx.data }, // send tokens to pool
      { who: tornadoPool.address, callData: onTokenBridgedTx.data }, // call onTokenBridgedTx
    ])

    // Alice withdraws 0.08 ETH in L2
    const aliceWithdrawAmount = utils.parseEther('0.08')
    const aliceChangeUtxo = new Utxo({
      amount: aliceDepositAmount.sub(aliceWithdrawAmount),
      keypair: aliceKeypair,
    })
    await transaction({
      tornadoPool,
      inputs: [aliceDepositUtxo],
      outputs: [aliceChangeUtxo],
      recipient: aliceWallet.address,
      isL1Withdrawal: false,
    })

    // assert recipient, omniBridge, and tornadoPool balances are correct.
    const aliceBalance = await token.balanceOf(aliceWallet.address)
    const omniBridgeBalance = await token.balanceOf(omniBridge.address)
    const poolBalance = await tornadoPool.lastBalance()

    // Alice withdrew on L2
    expect(aliceBalance).to.be.equal(utils.parseEther('0.08'))

    // Nothing to send to L1
    expect(omniBridgeBalance).to.be.equal(0)

    // Pool contains the remaining funds of Alice
    expect(poolBalance).to.be.equal(utils.parseEther('0.02'))
  })

  it('[assignment] iii. see assignment doc for details', async () => {
    // [assignment] complete code here
    const { tornadoPool, token, omniBridge } = await loadFixture(fixture)

    const aliceWallet = ethers.Wallet.createRandom()
    const aliceKeypair = new Keypair(aliceWallet.privateKey)
    const bobWallet = ethers.Wallet.createRandom()
    const bobKeypair = new Keypair(bobWallet.privateKey)

    // Alice deposits 0.13 ETH in L1
    const aliceDepositAmount = utils.parseEther('0.13')
    const aliceDepositUtxo = new Utxo({ amount: aliceDepositAmount, keypair: aliceKeypair })
    const { args, extData } = await prepareTransaction({
      tornadoPool,
      outputs: [aliceDepositUtxo],
    })
    const onTokenBridgedData = encodeDataForBridge({
      proof: args,
      extData,
    })
    const onTokenBridgedTx = await tornadoPool.populateTransaction.onTokenBridged(
      token.address,
      aliceDepositUtxo.amount,
      onTokenBridgedData,
    )
    await token.transfer(omniBridge.address, aliceDepositAmount)
    const transferTx = await token.populateTransaction.transfer(tornadoPool.address, aliceDepositAmount)
    await omniBridge.execute([
      { who: token.address, callData: transferTx.data }, // send tokens to pool
      { who: tornadoPool.address, callData: onTokenBridgedTx.data }, // call onTokenBridgedTx
    ])

    // Alice sends 0.06 ETH to Bob in L2
    const aliceToBobAmount = utils.parseEther('0.06')
    const aliceToBobUtxo = new Utxo({
      amount: aliceToBobAmount,
      keypair: bobKeypair,
    })
    const aliceToBobChangeUtxo = new Utxo({
      amount: aliceDepositAmount.sub(aliceToBobAmount),
      keypair: aliceKeypair,
    })
    await transaction({
      tornadoPool,
      inputs: [aliceDepositUtxo],
      outputs: [aliceToBobUtxo, aliceToBobChangeUtxo],
      recipient: aliceWallet.address,
      isL1Withdrawal: false,
    })

    // Bob withdraws all his funds in L2
    await transaction({
      tornadoPool,
      inputs: [aliceToBobUtxo],
      outputs: [],
      recipient: bobWallet.address,
      isL1Withdrawal: false,
    })

    // Alice withdraws all her remaining funds in L1
    await transaction({
      tornadoPool,
      inputs: [aliceToBobChangeUtxo],
      outputs: [],
      recipient: aliceWallet.address,
      isL1Withdrawal: true,
    })

    // assert all relevant balances are correct
    const aliceBalance = await token.balanceOf(aliceWallet.address)
    const bobBalance = await token.balanceOf(bobWallet.address)
    const omniBridgeBalance = await token.balanceOf(omniBridge.address)
    const poolBalance = await tornadoPool.lastBalance()

    // Alice has nothing on L2 as she withdrew to L1
    expect(aliceBalance).to.be.equal(0)

    // Bob withdrew his funds on L2
    expect(bobBalance).to.be.equal(utils.parseEther('0.06'))

    // Bridge will send the funds of Alice to L1
    expect(omniBridgeBalance).to.be.equal(utils.parseEther('0.07'))

    // All funds were withdrawn from pool
    expect(poolBalance).to.be.equal(0)
  })
})
