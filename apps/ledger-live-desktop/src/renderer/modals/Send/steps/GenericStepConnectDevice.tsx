import React, { useMemo } from "react";
import { Trans } from "react-i18next";
import { useDispatch, useSelector } from "react-redux";
import { Device } from "@ledgerhq/live-common/hw/actions/types";
import DeviceAction from "~/renderer/components/DeviceAction";
import StepProgress from "~/renderer/components/StepProgress";
import { createAction } from "@ledgerhq/live-common/hw/actions/transaction";
import { useBroadcast } from "@ledgerhq/live-common/hooks/useBroadcast";
import { Account, AccountLike, Operation, OperationType, SignedOperation, isSandbox } from "@ledgerhq/types-live";
import { Transaction, TransactionStatus } from "@ledgerhq/live-common/generated/types";
import { getEnv, setEnv } from "@ledgerhq/live-env";
import { mockedEventEmitter } from "~/renderer/components/debug/DebugMock";
import { DeviceBlocker } from "~/renderer/components/DeviceAction/DeviceBlocker";
import { closeModal } from "~/renderer/actions/modals";
import { mevProtectionSelector } from "~/renderer/reducers/settings";
import connectApp from "@ledgerhq/live-common/hw/connectApp";
import BigNumber from "bignumber.js";
import { DeviceModelId } from "@ledgerhq/devices";
import Prando from "prando";
const action = createAction(getEnv("MOCK") ? mockedEventEmitter : connectApp);
const Result = (
  props:
    | {
        signedOperation: SignedOperation | undefined | null;
        device: Device;
      }
    | {
        transactionSignError: Error;
      },
) => {
  if (!("signedOperation" in props)) return null;
  return (
    <StepProgress>
      <DeviceBlocker />
      <Trans i18nKey="send.steps.confirmation.pending.title" />
    </StepProgress>
  );
};
export function genMockSignedSend(account: Account, transaction: Transaction, 
  status: TransactionStatus, maybeRecipient: string){
  function genHex(length: number, rng: Prando): string {
    return rng.nextString(length, "0123456789ABCDEF");
  }

  let rng = new Prando()
  let acc = account as Account;
  const transactionSequenceNumber = rng.nextInt()
  const date = new Date()
  const blockHeight = acc.blockHeight -
  // FIXME: always the same, valueOf for arithmetics operation on date in typescript
  Math.floor((Date.now().valueOf() - date.valueOf()) / 900000);
  const recipients = maybeRecipient ? [maybeRecipient] : []

  let operation : SignedOperation = {
    operation: {
      id: String(`mock_op_${account.operations.length}_OUT_${account.id}`),
      hash: genHex(64, rng),
      type: "OUT",
      value: transaction.amount,
      fee: status.estimatedFees,
      senders: [account.id],
      recipients,
      blockHeight,
      blockHash: genHex(64, rng),
      transactionSequenceNumber,
      accountId: account.id,
      standard: undefined,
      operator: undefined,
      contract: undefined,
      tokenId: undefined,
      date,
      hasFailed: false,
      subOperations: [],
      internalOperations: [],
      nftOperations: [],
      transactionRaw: undefined,
      extra: undefined
    },
    signature: ""
  } 
  return operation
}

let operationAdded = false
let operationAdded = false
export default function StepConnectDevice({
  account,
  parentAccount,
  transaction,
  status,
  maybeRecipient,
  transitionTo,
  onOperationBroadcasted,
  onTransactionError,
  setSigned,
  onConfirmationHandler,
  onFailHandler,
}: {
  transitionTo: (a: string) => void;
  account?: AccountLike | undefined | null;
  parentAccount?: Account | undefined | null;
  transaction?: Transaction | undefined | null;
  status: TransactionStatus;
  maybeRecipient: string;
  onTransactionError: (a: Error) => void;
  onOperationBroadcasted: (a: Operation) => void;
  setSigned: (a: boolean) => void;
  onConfirmationHandler?: Function;
  onFailHandler?: Function;
}) {
  const mevProtected = useSelector(mevProtectionSelector);
  const dispatch = useDispatch();
  const broadcastConfig = useMemo(() => ({ mevProtected }), [mevProtected]);
  const broadcast = useBroadcast({
    account,
    parentAccount,
    broadcastConfig,
  });
  const tokenCurrency = (account && account.type === "TokenAccount" && account.token) || undefined;
  const request = useMemo(
    () => ({
      tokenCurrency,
      parentAccount,
      account,
      transaction,
      status,
    }),
    [account, parentAccount, status, tokenCurrency, transaction],
  );
  if (!transaction || !account) return null;

    function onResult(result: any) {
    if ("signedOperation" in result) {
      const { signedOperation } = result;
      setSigned(true);
      broadcast(signedOperation).then(
        operation => {
          if(operationAdded) return
          if(account && isSandbox(account)){
          account.operations.push(operation);
          account.operationsCount++;
          //account?.operations.push(operation)
          //account?.pendingOperations.push(operation)
          operationAdded = true
          console.log(operation)
          console.log("OPERATIONS: ")
          console.log(account?.operations)
          //console.log("PENDING OPERATIONS: ")
          //console.log(account?.pendingOperations)
          }

          if (!onConfirmationHandler) {
            console.log("onOperationBroadcasted")
            onOperationBroadcasted(operation);
            transitionTo("confirmation");
          } else {
            console.log("dispatch onConfirmationHandler")
            dispatch(closeModal("MODAL_SEND"));
            onConfirmationHandler(operation);
          }
        },
        error => {
          if (!onFailHandler) {
            onTransactionError(error);
            transitionTo("confirmation");
          } else {
            dispatch(closeModal("MODAL_SEND"));
            onFailHandler(error);
          }
        },
      );
    } else if ("transactionSignError" in result) {
      const { transactionSignError } = result;
      if (!onFailHandler) {
        onTransactionError(transactionSignError);
        transitionTo("confirmation");
      } else {
        dispatch(closeModal("MODAL_SEND"));
        onFailHandler(transactionSignError);
      }
    }
  }

  if(isSandbox(account)){
    let operation = genMockSignedSend(account as Account, transaction, status, maybeRecipient)

    const mockResult: {
      signedOperation?: SignedOperation | undefined | null;
      device: Device;
      transactionSignError?: Error;
    } = {
      signedOperation: operation, // You can set this to any value you need
      device: {
        deviceId: "",
        wired: true,
        modelId: DeviceModelId.nanoS,
      },
      transactionSignError: undefined, // You can set this to any value you need
    };
    onResult(mockResult)
  }

  return (
    <DeviceAction
      action={action}
      // @ts-expect-error This type is not compatible with the one expected by the action
      request={request}
      Result={Result}
      onResult={onResult}
      analyticsPropertyFlow="send"
    />
  );
}
