const dpack = require('@etherpacks/dpack')
const hh = require('hardhat')

const ethers = hh.ethers
const { send, want, snapshot, revert, b32, fail} = require('minihat')
const { expectEvent, check_gas} = require('./utils/helpers')
const { bounds } = require('./bounds')
const constants = ethers.constants
const { smock } = require('@defi-wonderland/smock')

const debug = require('debug')('dmap:test')

describe('dmap', ()=>{
    let dmap
    let rootzone
    let freezone

    let ali, bob, cat
    let ALI, BOB, CAT
    const LOCK = '0x80'+'00'.repeat(31)
    let signers
    before(async ()=>{
        [ali, bob, cat] = await ethers.getSigners();
        signers = await ethers.getSigners();
        [ALI, BOB, CAT] = [ali, bob, cat].map(x => x.address)

        await hh.run('deploy-mock-dmap')
        const dapp = await dpack.load(require('../pack/dmap_full_hardhat.dpack.json'), hh.ethers)
        dmap = dapp.dmap
        rootzone = dapp.rootzone
        freezone = dapp.freezone
        await snapshot(hh)
    })
    beforeEach(async ()=>{
        await revert(hh)
    })

    const check_entry = async (usr, key, _meta, _data) => {
        const meta = typeof(_meta) == 'string' ? _meta : '0x'+_meta.toString('hex')
        const data = typeof(_data) == 'string' ? _data : '0x'+_data.toString('hex')
        const res = await dmap.get(usr, key)
        want(res.meta).to.eql(meta)
        want(res.data).to.eql(data)
    }

    it('deploy postconditions', async ()=>{
        const dmap_ref = await rootzone.dmap()
        want(dmap_ref).eq(dmap.address)

        await check_entry(ALI, b32('1'), constants.HashZero, constants.HashZero)
        await check_entry(BOB, b32('1'), constants.HashZero, constants.HashZero)

        // dmap.get returns (meta, data), internal storage is (data, meta)
        const rootData = await dmap.provider.getStorageAt(dmap.address, 1)
        const rootMeta = await dmap.provider.getStorageAt(dmap.address, 0)
        want(ethers.utils.hexDataSlice(rootData, 0, 20))
            .to.eql(rootzone.address.toLowerCase())
        want(rootMeta).to.eql(LOCK)
    })

    it('address padding', async ()=> {
        const [root_self_meta, root_self] = await dmap.get(rootzone.address, b32('root'))
        const padded1 = ethers.utils.hexZeroPad(rootzone.address, 32)
        const padded2 = rootzone.address + '00'.repeat(33-rootzone.address.length/2)
        //console.log(root_self)
        //console.log(padded1)
        //console.log(padded2)
    })

    it('basic set', async () => {
        const name = '0x'+'11'.repeat(32)
        const meta = '0x'+'1'+'0'.repeat(63)
        const data = '0x'+'22'.repeat(32)
        const rx = await send(dmap.set, name, meta, data)

        const eventdata = meta + data.slice(2)
        expectEvent(
            rx, undefined,
            [ethers.utils.hexZeroPad(ALI, 32).toLowerCase(), name], eventdata
        )

        await check_entry(ALI, name, meta, data)
    })

    it("zone in hash", async () => {
        const alival = '0x'+'11'.repeat(32)
        const bobval = '0x'+'22'.repeat(32)
        await send(dmap.set, b32("1"), LOCK, alival)
        await send(dmap.connect(bob).set, b32("1"), LOCK, bobval)
        want(await dmap.get(ALI, b32("1"))).to.eql(alival)
        want(await dmap.get(BOB, b32("1"))).to.eql(bobval)
    })

    it('name in hash', async () => {
        const val0 = '0x'+'11'.repeat(32)
        const val1 = '0x'+'22'.repeat(32)
        await send(dmap.set, b32("1"), LOCK, val0)
        await send(dmap.set, b32("2"), LOCK, val1)
        want(await dmap.get(ALI, b32("1"))).to.eql(val0)
        want(await dmap.get(ALI, b32("2"))).to.eql(val1)
    })

    it('name all bits in hash', async () => {
        const names = [
            '0x'+'ff'.repeat(32),
            '0x'+'ff'.repeat(31)+'fe', // flip lsb
            '0x7f'+'ff'.repeat(31), // flip msb
        ]
        const vals = [
            '0x'+'11'.repeat(32),
            '0x'+'22'.repeat(32),
            '0x'+'33'.repeat(32),
        ]
        for( let i = 0; i < names.length; i++ ) {
            await send(dmap.set, names[i], LOCK, vals[i])
        }
        for( let i = 0; i < names.length; i++ ) {
            await check_entry(ALI, names[i], LOCK, vals[i])
        }
    })

    it('zone all bits in hash', async () => {

        const myFake = await smock.fake('Dmap')
        console.log(myFake)

        /*
        const lsb = x => ethers.BigNumber.from(x).and(1).toNumber()
        const msb = x => ethers.BigNumber.from(x).shr(20*8-1).toNumber()
        let fliplsb = undefined
        let flipmsb = undefined
        const lsbali = lsb(ALI)
        const msbali = msb(ALI)
        want(lsbali).lt(2)
        want(msbali).lt(2)
        for( let i = 0; i < signers.length; i++ ) {
            if( fliplsb != undefined && flipmsb != undefined ) {
                console.log("BREAK")
                break;
            }
            const signer = signers[i]
            const lsbx = lsb(signer.address)
            const msbx = msb(signer.address)
            want(lsbx).lt(2)
            want(msbx).lt(2)
            console.log(signer.address, msbx, lsbx)
            if( fliplsb == undefined && lsbx != lsbali ) {
                console.log("GOT ANOTHER")
                fliplsb = signer
            }
            if( flipmsb == undefined && msbx != msbali ) {
                console.log("GOT ONE")
                flipmsb = signer
            }
        }
        const users = [ali, fliplsb, flipmsb]
        const name = b32('name')
        const val = b32('val')
        for( let i = 0; i < users.length; i++ ) {
            await send(dmap.connect(users[i]).set, name, LOCK, val)
        }
        for( let i = 0; i < users.length; i++ ) {
            await check_entry(users[i].address, name, LOCK, val)
        }

         */
    })

    describe('lock', () => {
        const check_ext_unchanged = async () => {
            const zero = constants.HashZero
            await check_entry(BOB, b32("1"), zero, zero)
            await check_entry(ALI, b32("2"), zero, zero)
        }

        it('set without data', async () => {
            // set just lock bit, nothing else
            await send(dmap.set, b32("1"), LOCK, constants.HashZero)
            await check_entry(ALI, b32("1"), LOCK, constants.HashZero)

            // should fail whether or not ali attempts to change something
            await fail('LOCK', dmap.set, b32("1"), constants.HashZero, constants.HashZero)
            await fail('LOCK', dmap.set, b32("1"), LOCK, constants.HashZero)
            await fail('LOCK', dmap.set, b32("1"), constants.HashZero, b32('hello'))
            await fail('LOCK', dmap.set, b32("1"), LOCK, b32('hello'))
            await check_ext_unchanged()
        })

        it('set with data', async () => {
            // set lock and data
            await send(dmap.set, b32("1"), LOCK, b32('hello'))
            await check_entry(ALI, b32("1"), LOCK, b32('hello'))
            await fail('LOCK', dmap.set, b32("1"), LOCK, b32('hello'))
            await check_ext_unchanged()
        })

        it("set a few times, then lock", async () => {
            await send(dmap.set, b32("1"), constants.HashZero, constants.HashZero)
            await check_entry(ALI, b32("1"), constants.HashZero, constants.HashZero)

            await send(dmap.set, b32("1"), constants.HashZero, b32('hello'))
            await check_entry(ALI, b32("1"), constants.HashZero, b32('hello'))

            await send(dmap.set, b32("1"), constants.HashZero, b32('goodbye'))
            await check_entry(ALI, b32("1"), constants.HashZero, b32('goodbye'))

            await send(dmap.set, b32("1"), LOCK, b32('goodbye'))
            await check_entry(ALI, b32("1"), LOCK, b32('goodbye'))

            await fail('LOCK', dmap.set, b32("1"), constants.HashZero, constants.HashZero)
            await check_ext_unchanged()
        })

        it("0x7ffff... doesn't lock, 0xffff... locks", async () => {
            const FLIP_LOCK = '0x7'+'f'.repeat(63)
            await send(dmap.set, b32("1"), FLIP_LOCK, constants.HashZero)

            const neg_one = '0x'+'ff'.repeat(32)
            await send(dmap.set, b32("1"), neg_one, constants.HashZero)
            await fail('LOCK', dmap.set, b32("1"), constants.HashZero, constants.HashZero)
            await check_ext_unchanged()
        })
    })

    describe('gas', () => {
        const name = b32('MyKey')
        const one  = Buffer.from('10'.repeat(32), 'hex') // lock == 0
        const two  = Buffer.from('20'.repeat(32), 'hex')
        describe('set', () => {

            describe('no change', () => {
                it('0->0', async () => {
                    const rx = await send(dmap.set, name, constants.HashZero, constants.HashZero)
                    const bound = bounds.dmap.set[0][0]
                    await check_gas(rx.gasUsed, bound[0], bound[1])
                })
                it('1->1', async () => {
                    await send(dmap.set, name, one, one)
                    const rx = await send(dmap.set, name, one, one)
                    const bound = bounds.dmap.set[1][1]
                    await check_gas(rx.gasUsed, bound[0], bound[1])
                })
            })
            describe('change', () => {
                it('0->1', async () => {
                    const rx = await send(dmap.set, name, one, one)
                    const bound = bounds.dmap.set[0][1]
                    await check_gas(rx.gasUsed, bound[0], bound[1])
                })
                it('1->0', async () => {
                    await send(dmap.set, name, one, one)
                    const rx = await send(dmap.set, name, constants.HashZero, constants.HashZero)
                    const bound = bounds.dmap.set[1][0]
                    await check_gas(rx.gasUsed, bound[0], bound[1])
                })
                it('1->2', async () => {
                    await send(dmap.set, name, one, one)
                    const rx = await send(dmap.set, name, two, two)
                    const bound = bounds.dmap.set[1][2]
                    await check_gas(rx.gasUsed, bound[0], bound[1])
                })
            })
        })

        it('get', async () => {
            await send(dmap.set, name, one, one)
            const gas = await dmap.estimateGas.get(ALI, name)
            const bound = bounds.dmap.get
            await check_gas(gas, bound[0], bound[1])
        })

   })

})
