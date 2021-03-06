// Copyright (c) 2017 VMware, Inc. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
import { Component, Input, ViewChild, SimpleChanges, OnChanges } from '@angular/core';
import { NgForm } from '@angular/forms';
import { Subscription } from "rxjs";

import { Configuration, clone, isEmpty, getChanges, StringValueItem, BoolValueItem } from '@harbor/ui';
import { MessageHandlerService } from '../../shared/message-handler/message-handler.service';
import { ConfirmMessageHandler } from '../config.msg.utils';
import { AppConfigService } from '../../app-config.service';
import { ConfigurationService } from '../config.service';
import { catchError } from 'rxjs/operators';
const fakePass = 'aWpLOSYkIzJTTU4wMDkx';

@Component({
    selector: 'config-auth',
    templateUrl: 'config-auth.component.html',
    styleUrls: ['./config-auth.component.scss', '../config.component.scss']
})
export class ConfigurationAuthComponent implements OnChanges {
    changeSub: Subscription;
    testingLDAPOnGoing = false;
    onGoing = false;
    // tslint:disable-next-line:no-input-rename
    @Input('allConfig') currentConfig: Configuration = new Configuration();
    private originalConfig: Configuration;
    @ViewChild('authConfigFrom') authForm: NgForm;

    constructor(
        private msgHandler: MessageHandlerService,
        private configService: ConfigurationService,
        private appConfigService: AppConfigService,
        private confirmMessageHandler: ConfirmMessageHandler
    ) {
    }

    get checkable() {
        return this.currentConfig &&
            this.currentConfig.self_registration &&
            this.currentConfig.self_registration.value === true;
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes && changes["currentConfig"]) {

            this.originalConfig = clone(this.currentConfig);

        }
    }

    public get showLdap(): boolean {
        return this.currentConfig &&
            this.currentConfig.auth_mode &&
            this.currentConfig.auth_mode.value === 'ldap_auth';
    }

    public get showUAA(): boolean {
        return this.currentConfig && this.currentConfig.auth_mode && this.currentConfig.auth_mode.value === 'uaa_auth';
    }
    public get showOIDC(): boolean {
        return this.currentConfig && this.currentConfig.auth_mode && this.currentConfig.auth_mode.value === 'oidc_auth';
    }
    public get showHttpAuth(): boolean {
        return this.currentConfig && this.currentConfig.auth_mode && this.currentConfig.auth_mode.value === 'http_auth';
    }
    public get showSelfReg(): boolean {
        if (!this.currentConfig || !this.currentConfig.auth_mode) {
            return true;
        } else {
            return this.currentConfig.auth_mode.value !== 'ldap_auth' && this.currentConfig.auth_mode.value !== 'uaa_auth'
                && this.currentConfig.auth_mode.value !== 'http_auth' && this.currentConfig.auth_mode.value !== 'oidc_auth';
        }
    }

    public isValid(): boolean {
        return this.authForm && this.authForm.valid;
    }

    public hasChanges(): boolean {
        return !isEmpty(this.getChanges());
    }

    setVerifyCertValue($event: any) {
        this.currentConfig.ldap_verify_cert.value = $event;
    }

    public testLDAPServer(): void {
        if (this.testingLDAPOnGoing) {
            return; // Should not come here
        }

        let ldapSettings = {};
        for (let prop in this.currentConfig) {
            if (prop.startsWith('ldap_')) {
                ldapSettings[prop] = this.currentConfig[prop].value;
            }
        }

        let allChanges = this.getChanges();
        let ldapSearchPwd = allChanges['ldap_search_password'];
        if (ldapSearchPwd) {
            ldapSettings['ldap_search_password'] = ldapSearchPwd;
        } else {
            delete ldapSettings['ldap_search_password'];
        }

        // Fix: Confirm ldap scope is number
        ldapSettings['ldap_scope'] = +ldapSettings['ldap_scope'];

        this.testingLDAPOnGoing = true;
        this.configService.testLDAPServer(ldapSettings)
            .subscribe(respone => {
                this.testingLDAPOnGoing = false;
                this.msgHandler.showSuccess('CONFIG.TEST_LDAP_SUCCESS');
            }, error => {
                this.testingLDAPOnGoing = false;
                let err = error._body;
                if (!err || !err.trim()) {
                    err = 'UNKNOWN';
                }
                this.msgHandler.showError('CONFIG.TEST_LDAP_FAILED', { 'param': err });
            });
    }

    public get showLdapServerBtn(): boolean {
        return this.currentConfig.auth_mode &&
            this.currentConfig.auth_mode.value === 'ldap_auth';
    }

    public isLDAPConfigValid(): boolean {
        return this.isValid() &&
            !this.testingLDAPOnGoing;
    }

    public getChanges() {
        let allChanges = getChanges(this.originalConfig, this.currentConfig);
        let changes = {};
        for (let prop in allChanges) {
            if (prop.startsWith('ldap_')
                || prop.startsWith('uaa_')
                || prop.startsWith('oidc_')
                || prop === 'auth_mode'
                || prop === 'project_creattion_restriction'
                || prop === 'self_registration'
                || prop === 'http_authproxy_endpoint'
                || prop === 'http_authproxy_skip_cert_verify'
                || prop === 'http_authproxy_always_onboard'
            ) {
                changes[prop] = allChanges[prop];
            }
        }
        return changes;
    }

    public get hideLDAPTestingSpinner(): boolean {
        return !this.testingLDAPOnGoing || !this.showLdapServerBtn;
    }

    disabled(prop: any): boolean {
        return !(prop && prop.editable);
    }

    handleOnChange($event: any): void {
        if ($event && $event.target && $event.target["value"]) {
            let authMode = $event.target["value"];
            if (authMode === 'ldap_auth' || authMode === 'uaa_auth' || authMode === 'http_auth' || authMode === 'oidc_auth') {
                if (this.currentConfig.self_registration.value) {
                    this.currentConfig.self_registration.value = false; // unselect
                }
            }
        }
    }

    /**
    *
    * Save the changed values
    *
    * @memberOf ConfigurationComponent
    */
    public save(): void {
        let changes = this.getChanges();
        if (!isEmpty(changes)) {
            this.onGoing = true;
            this.configService.saveConfiguration(changes)
                .subscribe(response => {
                    this.onGoing = false;
                    this.retrieveConfig();
                    // Reload bootstrap option
                    this.appConfigService.load().subscribe(() => { }
                        , error => console.error('Failed to reload bootstrap option with error: ', error));
                    this.msgHandler.showSuccess('CONFIG.SAVE_SUCCESS');
                }, error => {
                    this.onGoing = false;
                    this.msgHandler.handleError(error);
                });
        } else {
            // Inprop situation, should not come here
            console.error('Save abort because nothing changed');
        }
    }

    retrieveConfig(): void {
        this.onGoing = true;
        this.configService.getConfiguration()
            .subscribe((configurations: Configuration) => {
                this.onGoing = false;

                // Add two password fields
                configurations.ldap_search_password = new StringValueItem(fakePass, true);
                configurations.uaa_client_secret = new StringValueItem(fakePass, true);
                configurations.oidc_client_secret = new StringValueItem(fakePass, true);
                this.currentConfig = configurations;
                // Keep the original copy of the data
                this.originalConfig = clone(configurations);
            }, error => {
                this.onGoing = false;
                this.msgHandler.handleError(error);
            });
    }

    /**
     *
     * Discard current changes if have and reset
     *
     * @memberOf ConfigurationComponent
     */
    public cancel(): void {
        let changes = this.getChanges();
        if (!isEmpty(changes)) {
            this.confirmMessageHandler.confirmUnsavedChanges(changes);
        } else {
            // Invalid situation, should not come here
            console.error('Nothing changed');
        }
    }

}
