import * as React from 'react';
import { Autorpc } from '@malagu/rpc/lib/common/annotation/detached';
import { WelcomeServer } from '../common/welcome-protocol';
import { View } from '@malagu/react';

interface Prop {}
interface State {
    response: string
}
@View()
export class Hello extends React.Component<Prop, State> {

    @Autorpc(WelcomeServer)
    protected welcomeServer!: WelcomeServer;

    constructor(prop: Prop) {
        super(prop);
        this.state = { response: 'Loading' };
    }

    async componentDidMount() {
        const response = await this.welcomeServer.say();
        this.setState({
            response
        });
    }

    render() {
        return <div>{this.state.response}</div>
    }
}
